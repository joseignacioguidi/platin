import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Charge,
  ChargeListItem,
  ChargesPage,
  ChargesQuery,
  ColorToken,
  CreateChargeRequest,
  StartStatement,
  UpdateChargeRequest,
} from '@platin/contracts';
import {
  Currency,
  installmentProgress,
  LocalDate,
  Money,
  parseLocalDate,
  Period,
  previousStatementWindow,
  scheduleInstallments,
  splitInstallments,
  totalFromInstallment,
  utcToLocalDate,
  utcToPeriod,
} from '@platin/domain';
import { CategoriesService } from '../categories/categories.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { afterCursor, decodeCursor, encodeCursor } from '../common/cursor';
import { cardCurrency, date, money, toDbDate, toDbPeriod } from '../common/serialize';
import type { CreditCard, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';
import { StatementsService } from './statements.service';

/** What a charge needs to be created inside an existing transaction (also used by sync). */
export interface NewCharge {
  categoryId: string;
  description: string;
  date: LocalDate;
  totalAmount: string;
  currency: Currency;
  installmentsCount: number;
  startInstallment: number;
  startStatement?: StartStatement;
  fixedId?: string;
  fixedPeriod?: Date;
  /** Where it came in (ADR 0026); the app by default. */
  channel?: 'APP' | 'TELEGRAM';
}

interface Plan {
  date: LocalDate;
  totalAmount: string;
  currency: Currency;
  installmentsCount: number;
  startInstallment: number;
  /** Where a started plan begins; ignored for a plan that starts at its first installment. */
  startStatement?: StartStatement;
  /** The statement a started plan already sits in, kept when the edit doesn't choose one. */
  keepPeriod?: Period;
}

const WITH_INSTALLMENTS = {
  installments: {
    include: { statement: { select: { id: true, period: true, status: true } } },
    orderBy: { number: 'asc' },
  },
} as const;

/**
 * TAR-02/03: a purchase becomes N installments, each in the statement after the previous one.
 * The first statement comes from the purchase date and the card's cycle (libs/domain).
 */
@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
    private readonly statements: StatementsService,
    private readonly categories: CategoriesService,
    private readonly clock: ClockService,
  ) {}

  async create(userId: string, cardId: string, request: CreateChargeRequest): Promise<Charge> {
    const id = await this.prisma.$transaction((tx) =>
      this.createIn(tx, userId, cardId, request, 'APP'),
    );
    return this.get(userId, id);
  }

  /** The same with the caller's transaction (the bot's update); checks run before the write. */
  async createIn(
    tx: Prisma.TransactionClient,
    userId: string,
    cardId: string,
    request: CreateChargeRequest,
    channel: 'APP' | 'TELEGRAM',
  ): Promise<string> {
    const card = await this.cards.getActive(userId, cardId);
    await this.categories.getOwned(userId, request.categoryId, 'EXPENSE');
    const installmentsCount = request.installmentsCount ?? 1;
    // TAR-02: with the installment as the bank shows it, the total is installment × count.
    const total = request.installmentAmount
      ? totalFromInstallment(
          Money.of(request.installmentAmount, request.currency),
          installmentsCount,
        )
      : Money.of(request.totalAmount as string, request.currency);
    return this.createInTx(tx, card, {
      categoryId: request.categoryId,
      description: request.description,
      date: parseLocalDate(request.date),
      totalAmount: total.toString(),
      currency: request.currency,
      installmentsCount,
      startInstallment: request.startInstallment ?? 1,
      startStatement: request.startStatement ?? 'OPEN',
      channel,
    });
  }

  /** Creates the charge and its installments with the caller's transaction; returns its id. */
  async createInTx(
    tx: Prisma.TransactionClient,
    card: CreditCard,
    charge: NewCharge,
  ): Promise<string> {
    const row = await tx.cardCharge.create({
      data: {
        userId: card.userId,
        cardId: card.id,
        categoryId: charge.categoryId,
        date: toDbDate(charge.date),
        description: charge.description,
        totalAmount: Money.of(charge.totalAmount, charge.currency).toString(),
        currency: charge.currency,
        installmentsCount: charge.installmentsCount,
        startInstallment: charge.startInstallment,
        fixedId: charge.fixedId ?? null,
        fixedPeriod: charge.fixedPeriod ?? null,
        channel: charge.channel ?? 'APP',
      },
    });
    await this.createInstallments(tx, card, row.id, charge);
    return row.id;
  }

  /**
   * TAR-13: purchases of one card or all, newest first, with text, date and status filters.
   * Finished = every installment is in a closed statement (so the last one is too).
   */
  async list(userId: string, query: ChargesQuery): Promise<ChargesPage> {
    if (query.cardId) await this.cards.getOwned(userId, query.cardId);
    const limit = query.limit ?? 30;
    const rows = await this.prisma.cardCharge.findMany({
      where: {
        userId,
        ...(query.cardId ? { cardId: query.cardId } : {}),
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: toDbDate(query.from) } : {}),
                ...(query.to ? { lte: toDbDate(query.to) } : {}),
              },
            }
          : {}),
        ...(query.query ? { description: { contains: query.query, mode: 'insensitive' } } : {}),
        ...(query.status === 'active'
          ? { installments: { some: { statement: { status: 'OPEN' } } } }
          : query.status === 'finished'
            ? { installments: { none: { statement: { status: 'OPEN' } } } }
            : {}),
        ...afterCursor(query.cursor ? decodeCursor(query.cursor) : undefined),
      },
      include: {
        card: { select: { name: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
        installments: {
          include: { statement: { select: { status: true } } },
          orderBy: { number: 'asc' },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row): ChargeListItem => {
        const states = row.installments.map((i) => ({
          number: i.number,
          amount: Money.of(i.amount.toFixed(2), row.currency),
          inClosedStatement: i.statement.status !== 'OPEN',
        }));
        const progress = installmentProgress(row.installmentsCount, states, row.currency);
        return {
          id: row.id,
          cardId: row.cardId,
          cardName: row.card.name,
          date: date(row.date),
          description: row.description,
          category: { ...row.category, color: row.category.color as ColorToken },
          totalAmount: money(row.totalAmount),
          currency: cardCurrency(row.currency),
          installmentsCount: row.installmentsCount,
          installmentAmount: (states[0]?.amount ?? Money.zero(row.currency)).toString(),
          current: progress.current,
          status: states.some((s) => !s.inClosedStatement) ? 'active' : 'finished',
          fromFixed: row.fixedId !== null,
        };
      }),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ date: last.date, createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async get(userId: string, id: string): Promise<Charge> {
    const row = await this.prisma.cardCharge.findFirst({
      where: { id, userId },
      include: WITH_INSTALLMENTS,
    });
    if (!row) throw AppException.notFound('Charge not found');
    return {
      id: row.id,
      cardId: row.cardId,
      date: date(row.date),
      description: row.description,
      categoryId: row.categoryId,
      totalAmount: money(row.totalAmount),
      currency: cardCurrency(row.currency),
      installmentsCount: row.installmentsCount,
      startInstallment: row.startInstallment,
      fixedId: row.fixedId,
      locked: row.installments.some((i) => i.statement.status !== 'OPEN'),
      installments: row.installments.map((i) => ({
        number: i.number,
        amount: money(i.amount),
        period: utcToPeriod(i.statement.period),
        statementId: i.statement.id,
      })),
    };
  }

  /**
   * Description and category can always change. Amount, date or installments regenerate the
   * plan, which is only possible while none of its installments is in a closed statement.
   */
  async update(userId: string, id: string, changes: UpdateChargeRequest): Promise<Charge> {
    const row = await this.getOwnedWithInstallments(userId, id);
    if (changes.categoryId) await this.categories.getOwned(userId, changes.categoryId, 'EXPENSE');
    // Values equal to the current ones are not a change (the edit form sends the whole charge).
    const replan =
      (changes.totalAmount !== undefined &&
        !Money.of(changes.totalAmount, row.currency).equals(
          Money.of(row.totalAmount.toFixed(2), row.currency),
        )) ||
      (changes.date !== undefined && changes.date !== utcToLocalDate(row.date)) ||
      (changes.installmentsCount !== undefined &&
        changes.installmentsCount !== row.installmentsCount);
    const card = await this.prisma.creditCard.findUniqueOrThrow({ where: { id: row.cardId } });
    const currentFirst = row.installments[0]
      ? utcToPeriod(row.installments[0].statement.period)
      : undefined;
    if (changes.startStatement && row.startInstallment === 1) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'Only a started purchase can choose its starting statement',
      );
    }
    // The chosen statement moves the plan only when it is not where the plan already is.
    const targetPeriod = changes.startStatement
      ? await this.startPeriod(this.prisma, card, {
          date: utcToLocalDate(row.date),
          totalAmount: row.totalAmount.toFixed(2),
          currency: row.currency,
          installmentsCount: row.installmentsCount,
          startInstallment: row.startInstallment,
          startStatement: changes.startStatement,
        })
      : undefined;
    const moved = targetPeriod !== undefined && targetPeriod !== currentFirst;
    if (replan || moved) this.assertNothingClosed(row.installments);
    if (
      changes.installmentsCount !== undefined &&
      changes.installmentsCount < row.startInstallment
    ) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'There are fewer installments than the starting one',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cardCharge.update({
        where: { id },
        data: {
          ...(changes.description ? { description: changes.description } : {}),
          ...(changes.categoryId ? { categoryId: changes.categoryId } : {}),
          ...(changes.date ? { date: toDbDate(changes.date) } : {}),
          ...(changes.totalAmount
            ? { totalAmount: Money.of(changes.totalAmount, row.currency).toString() }
            : {}),
          ...(changes.installmentsCount ? { installmentsCount: changes.installmentsCount } : {}),
        },
      });
      if (!replan && !moved) return;
      await tx.installment.deleteMany({ where: { chargeId: id } });
      await this.createInstallments(tx, card, id, {
        keepPeriod: targetPeriod ?? currentFirst,
        date: utcToLocalDate(updated.date),
        totalAmount: updated.totalAmount.toFixed(2),
        currency: updated.currency,
        installmentsCount: updated.installmentsCount,
        startInstallment: updated.startInstallment,
      });
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.getOwnedWithInstallments(userId, id);
    this.assertNothingClosed(row.installments);
    await this.prisma.cardCharge.delete({ where: { id } });
  }

  private async createInstallments(
    tx: Prisma.TransactionClient,
    card: CreditCard,
    chargeId: string,
    plan: Plan,
  ): Promise<void> {
    const firstPeriod = await this.startPeriod(tx, card, plan);
    const schedule = scheduleInstallments(
      splitInstallments(
        Money.of(plan.totalAmount, plan.currency),
        plan.installmentsCount,
        plan.startInstallment,
      ),
      firstPeriod,
    );
    await this.statements.ensure(
      tx,
      card,
      schedule.map((i) => i.period),
    );
    const statements = await tx.cardStatement.findMany({
      where: { cardId: card.id, period: { in: schedule.map((i) => toDbPeriod(i.period)) } },
      select: { id: true, period: true },
    });
    const byPeriod = new Map(statements.map((s) => [utcToPeriod(s.period), s.id]));
    await tx.installment.createMany({
      data: schedule.map((i) => ({
        chargeId,
        statementId: byPeriod.get(i.period) as string,
        number: i.number,
        amount: i.amount.toString(),
        currency: plan.currency,
      })),
    });
  }

  /**
   * A plan migrated as "k of N" starts at today's open statement, or at the one that closed and
   * is not yet due when asked (TAR-03); a new purchase, at the statement of its date.
   */
  private async startPeriod(
    db: Prisma.TransactionClient | PrismaService,
    card: CreditCard,
    plan: Plan,
  ): Promise<Period> {
    if (plan.startInstallment <= 1) return this.statements.openPeriodFor(db, card, plan.date);
    if (plan.startStatement === 'PREVIOUS') {
      const window = previousStatementWindow(
        card,
        this.clock.today(),
        await this.statements.overrides(db, card.id),
      );
      const existing = window
        ? await db.cardStatement.findFirst({
            where: { cardId: card.id, period: toDbPeriod(window.period) },
            select: { status: true },
          })
        : null;
      if (!window || (existing && existing.status !== 'OPEN')) {
        throw new AppException(
          'PREVIOUS_STATEMENT_NOT_AVAILABLE',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'The previous statement is not available for this purchase',
        );
      }
      return window.period;
    }
    if (plan.startStatement === undefined && plan.keepPeriod) return plan.keepPeriod;
    return this.statements.openPeriodFor(db, card, this.clock.today());
  }

  private assertNothingClosed(installments: { statement: { status: string } }[]): void {
    if (installments.some((i) => i.statement.status !== 'OPEN')) {
      throw new AppException(
        'CARD_STATEMENT_CLOSED',
        HttpStatus.CONFLICT,
        'Some installments are in a closed statement',
      );
    }
  }

  private async getOwnedWithInstallments(userId: string, id: string) {
    const row = await this.prisma.cardCharge.findFirst({
      where: { id, userId },
      include: WITH_INSTALLMENTS,
    });
    if (!row) throw AppException.notFound('Charge not found');
    return row;
  }
}
