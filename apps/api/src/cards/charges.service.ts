import { HttpStatus, Injectable } from '@nestjs/common';
import type { Charge, CreateChargeRequest, UpdateChargeRequest } from '@platin/contracts';
import {
  Currency,
  LocalDate,
  Money,
  parseLocalDate,
  scheduleInstallments,
  splitInstallments,
  utcToLocalDate,
  utcToPeriod,
} from '@platin/domain';
import { CategoriesService } from '../categories/categories.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { date, money, toDbDate, toDbPeriod } from '../common/serialize';
import type { CreditCard, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';
import { StatementsService } from './statements.service';

interface Plan {
  date: LocalDate;
  totalAmount: string;
  currency: Currency;
  installmentsCount: number;
  startInstallment: number;
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
    const card = await this.cards.getActive(userId, cardId);
    await this.categories.getOwned(userId, request.categoryId, 'EXPENSE');
    const plan: Plan = {
      date: parseLocalDate(request.date),
      totalAmount: request.totalAmount,
      currency: request.currency,
      installmentsCount: request.installmentsCount ?? 1,
      startInstallment: request.startInstallment ?? 1,
    };

    const id = await this.prisma.$transaction(async (tx) => {
      const charge = await tx.cardCharge.create({
        data: {
          userId,
          cardId: card.id,
          categoryId: request.categoryId,
          date: toDbDate(plan.date),
          description: request.description,
          totalAmount: Money.of(plan.totalAmount, plan.currency).toString(),
          currency: plan.currency,
          installmentsCount: plan.installmentsCount,
          startInstallment: plan.startInstallment,
        },
      });
      await this.createInstallments(tx, card, charge.id, plan);
      return charge.id;
    });
    return this.get(userId, id);
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
      currency: row.currency,
      installmentsCount: row.installmentsCount,
      startInstallment: row.startInstallment,
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
    if (replan) this.assertNothingClosed(row.installments);
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
      if (!replan) return;
      await tx.installment.deleteMany({ where: { chargeId: id } });
      const card = await tx.creditCard.findUniqueOrThrow({ where: { id: row.cardId } });
      await this.createInstallments(tx, card, id, {
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
    // A plan migrated as "k of N" starts at today's open statement; a new purchase, at the
    // statement of its date.
    const anchor = plan.startInstallment > 1 ? this.clock.today() : plan.date;
    const firstPeriod = await this.statements.openPeriodFor(tx, card, anchor);
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
