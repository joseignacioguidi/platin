import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ActiveInstallment,
  Card,
  ColorToken,
  CreateCardRequest,
  StatementSummary,
  UpdateCardRequest,
} from '@platin/contracts';
import { installmentProgress, Money, Period, utcToPeriod } from '@platin/domain';
import { PocketsService } from '../accounts/pockets.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { cardCurrency } from '../common/serialize';
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
      await this.pockets.getActive(userId, request.defaultPaymentPocketId);
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
      await this.pockets.getActive(userId, changes.defaultPaymentPocketId);
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
      openStatement: open ? toStatementSummary(open) : null,
      committedArs: committed.toString(),
      available: limit ? limit.subtract(committed).toString() : null,
    };
  }
}
