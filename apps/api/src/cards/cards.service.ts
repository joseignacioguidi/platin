import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ActiveInstallment,
  Card,
  ColorToken,
  CreateCardRequest,
  InstallmentStatement,
  StatementPlanInstallment,
  StatementSummary,
  UpdateCardRequest,
} from '@platin/contracts';
import {
  addDays,
  installmentProgress,
  Money,
  Period,
  previousStatementWindow,
  topInstallmentCounts,
  utcToLocalDate,
  utcToPeriod,
} from '@platin/domain';
import { PocketsService } from '../accounts/pockets.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { cardCurrency, toDbDate, toDbPeriod } from '../common/serialize';
import type { CreditCard } from '../generated/prisma/client';
import { EntitlementsService } from '../plans/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { STATEMENT_PARTS, statementTotals, toStatementSummary } from './statement-math';
import { StatementsService } from './statements.service';

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statements: StatementsService,
    private readonly pockets: PocketsService,
    private readonly clock: ClockService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(userId: string, includeArchived = false): Promise<Card[]> {
    const cards = await this.prisma.creditCard.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(cards.map((card) => this.toDto(card)));
  }

  async get(userId: string, id: string): Promise<Card> {
    return this.toDto(await this.getOwned(userId, id));
  }

  async create(userId: string, request: CreateCardRequest): Promise<Card> {
    if (request.defaultPaymentPocketId) {
      await this.pockets.getCardPayer(userId, request.defaultPaymentPocketId);
    }
    const card = await this.entitlements.withinLimits(userId, { cards: 1 }, (tx) =>
      tx.creditCard.create({
        data: {
          userId,
          name: request.name,
          issuer: request.issuer ?? null,
          last4: request.last4 ?? null,
          creditLimit: request.creditLimit ?? null,
          closingDay: request.closingDay,
          dueDay: request.dueDay,
          defaultPaymentPocketId: request.defaultPaymentPocketId ?? null,
        },
      }),
    );
    return this.toDto(card);
  }

  /**
   * Changing the closing or due day only affects statements created from now on; existing
   * ones keep their dates (they may already hold installments).
   */
  async update(userId: string, id: string, changes: UpdateCardRequest): Promise<Card> {
    const current = await this.getOwned(userId, id);
    if (changes.defaultPaymentPocketId) {
      await this.pockets.getCardPayer(userId, changes.defaultPaymentPocketId);
    }
    const { archived, ...rest } = changes;
    // Restoring an archived card makes it count for the plan again (SEC-F05).
    const needs = archived === false && current.archivedAt ? { cards: 1 } : {};
    const card = await this.entitlements.withinLimits(userId, needs, (tx) =>
      tx.creditCard.update({
        where: { id },
        data: {
          ...rest,
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
        },
      }),
    );
    return this.toDto(card);
  }

  async statementsOf(
    userId: string,
    id: string,
    query: { from?: Period; to?: Period; status?: 'closed'; cursor?: Period; limit?: number },
  ): Promise<StatementSummary[]> {
    const card = await this.getOwned(userId, id);
    if (query.status === 'closed') {
      return this.statements.history(card, query.cursor, query.limit ?? 12);
    }
    return this.statements.list(card, this.clock.today(), query.from, query.to);
  }

  /** TAR-05: plans with installments still to close. */
  async activeInstallments(
    userId: string,
    id: string,
    onlyActive: boolean,
  ): Promise<ActiveInstallment[]> {
    await this.getOwned(userId, id);
    const charges = await this.prisma.cardCharge.findMany({
      where: { cardId: id, userId, installmentsCount: { gt: 1 } },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        installments: {
          include: { statement: { select: { status: true, period: true } } },
          orderBy: { number: 'asc' },
        },
      },
      orderBy: { date: 'desc' },
    });
    return charges
      .map((charge) => {
        const states = charge.installments.map((i) => ({
          number: i.number,
          amount: Money.of(i.amount.toFixed(2), charge.currency),
          inClosedStatement: i.statement.status !== 'OPEN',
        }));
        const progress = installmentProgress(charge.installmentsCount, states, charge.currency);
        const next = states.find((s) => !s.inClosedStatement);
        const last = charge.installments[charge.installments.length - 1];
        return {
          chargeId: charge.id,
          description: charge.description,
          category: { ...charge.category, color: charge.category.color as ColorToken },
          currency: cardCurrency(charge.currency),
          totalAmount: charge.totalAmount.toFixed(2),
          count: progress.count,
          current: progress.current,
          remainingCount: progress.remainingCount,
          remainingAmount: progress.remainingAmount.toString(),
          installmentAmount: (next ?? states[states.length - 1]).amount.toString(),
          lastPeriod: last ? utcToPeriod(last.statement.period) : '',
        };
      })
      .filter((plan) => !onlyActive || plan.remainingCount > 0);
  }

  /**
   * TAR-05 / COM-03 (iteration 9): the statements from the first to the last one with
   * installments, with what the installments add up to and what each one frees.
   */
  async installmentStatements(userId: string, id: string): Promise<InstallmentStatement[]> {
    await this.getOwned(userId, id);
    const installments = await this.prisma.installment.findMany({
      where: { charge: { cardId: id, userId } },
      select: {
        number: true,
        amount: true,
        currency: true,
        statementId: true,
        charge: { select: { installmentsCount: true } },
        statement: { select: { period: true } },
      },
    });
    if (installments.length === 0) return [];
    const periods = installments.map((i) => i.statement.period.getTime());
    const statements = await this.prisma.cardStatement.findMany({
      where: {
        cardId: id,
        userId,
        period: { gte: new Date(Math.min(...periods)), lte: new Date(Math.max(...periods)) },
      },
      orderBy: { period: 'asc' },
    });
    const byCurrency = (rows: typeof installments, currency: 'ARS' | 'USD') =>
      Money.sum(
        rows.filter((i) => i.currency === currency).map((i) => Money.of(i.amount.toFixed(2), currency)),
        currency,
      ).toString();
    return statements.map((statement) => {
      const own = installments.filter((i) => i.statementId === statement.id);
      const ending = own.filter(
        (i) => i.charge.installmentsCount > 1 && i.number === i.charge.installmentsCount,
      );
      return {
        period: utcToPeriod(statement.period),
        dueDate: utcToLocalDate(statement.dueDate),
        status: statement.status,
        installmentsTotal: { ARS: byCurrency(own, 'ARS'), USD: byCurrency(own, 'USD') },
        installmentsCount: own.length,
        releases: { ARS: byCurrency(ending, 'ARS'), USD: byCurrency(ending, 'USD') },
      };
    });
  }

  /** TAR-05 (iteration 9): the installments of the statement of `period`, as of that statement. */
  async statementInstallments(
    userId: string,
    id: string,
    period: Period,
  ): Promise<StatementPlanInstallment[]> {
    await this.getOwned(userId, id);
    const rows = await this.prisma.installment.findMany({
      where: { statement: { cardId: id, userId, period: toDbPeriod(period) } },
      include: {
        charge: {
          include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            installments: { select: { number: true, amount: true } },
          },
        },
      },
      orderBy: [{ charge: { date: 'desc' } }, { charge: { createdAt: 'desc' } }],
    });
    return rows.map(({ charge, number, amount }) => {
      const currency = cardCurrency(charge.currency);
      return {
        chargeId: charge.id,
        description: charge.description,
        category: { ...charge.category, color: charge.category.color as ColorToken },
        currency,
        number,
        count: charge.installmentsCount,
        amount: amount.toFixed(2),
        paidThrough: number,
        remainingAfter: Money.sum(
          charge.installments
            .filter((i) => i.number > number)
            .map((i) => Money.of(i.amount.toFixed(2), currency)),
          currency,
        ).toString(),
      };
    });
  }

  async getOwned(userId: string, id: string): Promise<CreditCard> {
    const card = await this.prisma.creditCard.findFirst({ where: { id, userId } });
    if (!card) throw AppException.notFound('Card not found');
    return card;
  }

  async getActive(userId: string, id: string): Promise<CreditCard> {
    const card = await this.getOwned(userId, id);
    if (card.archivedAt) {
      throw new AppException(
        'CARD_ARCHIVED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The card is archived',
      );
    }
    return card;
  }

  /** TAR-03: the closed, not yet due statement a started purchase can go into, if it can. */
  private async previousStatement(card: CreditCard): Promise<Card['previousStatement']> {
    const window = previousStatementWindow(
      card,
      this.clock.today(),
      await this.statements.overrides(this.prisma, card.id),
    );
    if (!window) return null;
    const existing = await this.prisma.cardStatement.findFirst({
      where: { cardId: card.id, period: toDbPeriod(window.period) },
      select: { status: true },
    });
    if (existing && existing.status !== 'OPEN') return null;
    return {
      period: window.period,
      closingDate: window.closingDate,
      dueDate: window.dueDate,
    };
  }

  private async toDto(card: CreditCard): Promise<Card> {
    const openPeriod = await this.statements.openPeriodFor(this.prisma, card, this.clock.today());
    await this.statements.ensure(this.prisma, card, [openPeriod]);
    const unpaid = await this.prisma.cardStatement.findMany({
      where: { cardId: card.id, status: { not: 'PAID' } },
      include: STATEMENT_PARTS,
    });
    const open = unpaid.find((row) => utcToPeriod(row.period) === openPeriod);
    const committed = Money.sum(
      unpaid.map((row) => statementTotals(row).pending.ARS),
      'ARS',
    );
    const limit = card.creditLimit ? Money.of(card.creditLimit.toFixed(2), 'ARS') : null;
    return {
      id: card.id,
      name: card.name,
      issuer: card.issuer,
      last4: card.last4,
      creditLimit: limit?.toString() ?? null,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      defaultPaymentPocketId: card.defaultPaymentPocketId,
      archived: card.archivedAt !== null,
      aliases: (
        await this.prisma.sourceAlias.findMany({
          where: { cardId: card.id },
          select: { alias: true },
          orderBy: { alias: 'asc' },
        })
      ).map((entry) => entry.alias),
      openStatement: open ? toStatementSummary(open) : null,
      previousStatement: await this.previousStatement(card),
      committedArs: committed.toString(),
      available: limit ? limit.subtract(committed).toString() : null,
      topInstallments: await this.topInstallments(card),
    };
  }

  /** "Cuotas más usadas": the installment counts of the card's purchases of the last 12 months. */
  private async topInstallments(card: CreditCard): Promise<[number, number]> {
    const since = addDays(this.clock.today(), -365);
    const charges = await this.prisma.cardCharge.findMany({
      where: { cardId: card.id, userId: card.userId, date: { gte: toDbDate(since) } },
      select: { installmentsCount: true },
    });
    return topInstallmentCounts(charges.map((charge) => charge.installmentsCount));
  }
}
