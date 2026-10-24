import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CloseStatementRequest,
  ColorToken,
  PayStatementRequest,
  StatementDetail,
  StatementSummary,
} from '@platin/contracts';
import {
  addMonths,
  buildStatementDates,
  compareDates,
  LocalDate,
  Money,
  Period,
  periodRange,
  StatementDates,
  statementPeriodFor,
  utcToLocalDate,
  utcToPeriod,
} from '@platin/domain';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { AppException } from '../common/app-exception';
import { date, money, toDbDate, toDbPeriod } from '../common/serialize';
import type { CreditCard, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  STATEMENT_PARTS,
  statementTotals,
  statusAfterPayment,
  toStatementSummary,
} from './statement-math';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Statements are created when needed (when a charge lands in them or a range is queried),
 * with the default dates from libs/domain unless they were corrected by hand.
 */
@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
  ) {}

  /** Manual date corrections of a card (TAR-06), by period. */
  async overrides(db: Db, cardId: string): Promise<Map<Period, StatementDates>> {
    const rows = await db.cardStatement.findMany({ where: { cardId, datesOverridden: true } });
    return new Map(
      rows.map((row) => [
        utcToPeriod(row.period),
        { closingDate: utcToLocalDate(row.closingDate), dueDate: utcToLocalDate(row.dueDate) },
      ]),
    );
  }

  /** Creates the statements of these periods that don't exist yet. */
  async ensure(db: Db, card: CreditCard, periods: readonly Period[]): Promise<void> {
    if (periods.length === 0) return;
    await db.cardStatement.createMany({
      data: periods.map((period) => {
        const dates = buildStatementDates(card, period);
        return {
          userId: card.userId,
          cardId: card.id,
          period: toDbPeriod(period),
          closingDate: toDbDate(dates.closingDate),
          dueDate: toDbDate(dates.dueDate),
        };
      }),
      skipDuplicates: true,
    });
  }

  /**
   * The statement collecting purchases made on `day`: the one by date, or the next one that
   * is still open if it is already closed (a late purchase goes to the next statement).
   */
  async openPeriodFor(db: Db, card: CreditCard, day: LocalDate): Promise<Period> {
    let period = statementPeriodFor(card, day, await this.overrides(db, card.id));
    const closed = await db.cardStatement.findMany({
      where: { cardId: card.id, status: { not: 'OPEN' }, period: { gte: toDbPeriod(period) } },
      select: { period: true },
    });
    const closedPeriods = new Set(closed.map((row) => utcToPeriod(row.period)));
    while (closedPeriods.has(period)) period = addMonths(period, 1);
    return period;
  }

  /** Statements of a card in a range (creating missing ones from the open one on). */
  async list(
    card: CreditCard,
    today: LocalDate,
    from?: Period,
    to?: Period,
  ): Promise<StatementSummary[]> {
    const open = await this.openPeriodFor(this.prisma, card, today);
    const start = from ?? addMonths(open, -3);
    const end = to ?? addMonths(open, 11);
    const ensureFrom = compareDates(start, open) > 0 ? start : open;
    await this.ensure(this.prisma, card, periodRange(ensureFrom, end));
    const rows = await this.prisma.cardStatement.findMany({
      where: { cardId: card.id, period: { gte: toDbPeriod(start), lte: toDbPeriod(end) } },
      include: STATEMENT_PARTS,
      orderBy: { period: 'asc' },
    });
    return rows.map(toStatementSummary);
  }

  async detail(userId: string, id: string): Promise<StatementDetail> {
    const row = await this.prisma.cardStatement.findFirst({
      where: { id, userId },
      include: {
        card: { select: { name: true } },
        installments: {
          include: {
            charge: {
              select: {
                id: true,
                description: true,
                date: true,
                installmentsCount: true,
                category: { select: { id: true, name: true, icon: true, color: true } },
              },
            },
          },
          orderBy: [{ charge: { date: 'asc' } }, { number: 'asc' }],
        },
        adjustments: {
          include: { category: { select: { id: true, name: true, icon: true, color: true } } },
        },
        payments: {
          include: { fromAccount: { select: { name: true, currency: true } } },
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!row) throw AppException.notFound('Statement not found');
    const asColor = <T extends { color: string }>(c: T) => ({ ...c, color: c.color as ColorToken });
    return {
      ...toStatementSummary(row),
      cardName: row.card.name,
      installments: row.installments.map((i) => ({
        id: i.id,
        chargeId: i.chargeId,
        description: i.charge.description,
        purchaseDate: date(i.charge.date),
        number: i.number,
        count: i.charge.installmentsCount,
        amount: money(i.amount),
        currency: i.currency,
        category: asColor(i.charge.category),
      })),
      adjustments: row.adjustments.map((a) => ({
        id: a.id,
        amount: money(a.amount),
        currency: a.currency,
        description: a.description,
        category: asColor(a.category),
      })),
      payments: row.payments.map((p) => ({
        id: p.id,
        date: date(p.date),
        accountName: p.fromAccount.name,
        amountOut: money(p.amountOut),
        currencyOut: p.fromAccount.currency,
        amountIn: money(p.amountIn),
        currencyIn: p.currencyIn,
      })),
    };
  }

  /**
   * TAR-07: closes with the bank's totals. For each currency, bank − calculated becomes a
   * StatementAdjustment (interest, taxes, stamps) with the given category.
   */
  async close(
    userId: string,
    id: string,
    request: CloseStatementRequest,
  ): Promise<StatementSummary> {
    const row = await this.getOwned(userId, id);
    if (row.status !== 'OPEN') {
      throw new AppException(
        'STATEMENT_ALREADY_CLOSED',
        HttpStatus.CONFLICT,
        'The statement is already closed',
      );
    }
    const totals = statementTotals(row);
    const differences = (['ARS', 'USD'] as const)
      .map((currency) => {
        const bank = currency === 'ARS' ? request.bankTotalArs : request.bankTotalUsd;
        return bank === undefined
          ? null
          : Money.of(bank, currency).subtract(totals.totals[currency]);
      })
      .filter((diff): diff is Money => diff !== null && !diff.isZero());

    if (differences.length > 0) {
      if (!request.adjustmentCategoryId) {
        throw new AppException(
          'ADJUSTMENT_CATEGORY_REQUIRED',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'The difference with the bank needs a category (interest, taxes)',
        );
      }
      await this.categories.getOwned(userId, request.adjustmentCategoryId, 'EXPENSE');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const difference of differences) {
        await tx.statementAdjustment.create({
          data: {
            statementId: row.id,
            categoryId: request.adjustmentCategoryId as string,
            amount: difference.toString(),
            currency: difference.currency,
            description: request.description ?? 'Diferencia con el resumen del banco',
          },
        });
      }
      const updated = await tx.cardStatement.findUniqueOrThrow({
        where: { id },
        include: STATEMENT_PARTS,
      });
      const after = statementTotals(updated);
      const nothingToPay = after.pending.ARS.isZero() && after.pending.USD.isZero();
      await tx.cardStatement.update({
        where: { id },
        data: {
          status: nothingToPay ? 'PAID' : 'CLOSED',
          bankTotalArs: request.bankTotalArs ?? null,
          bankTotalUsd: request.bankTotalUsd ?? null,
        },
      });
    });
    return toStatementSummary(await this.getOwned(userId, id));
  }

  /**
   * TAR-08: pays the pesos or the dollars part from an account, as a Transfer to the statement.
   * The expense was already recorded with the purchase; the payment doesn't duplicate it.
   */
  async pay(userId: string, id: string, request: PayStatementRequest): Promise<StatementSummary> {
    const row = await this.getOwned(userId, id);
    if (row.status === 'OPEN') {
      throw new AppException(
        'STATEMENT_NOT_CLOSED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Close the statement before paying it',
      );
    }
    const account = await this.accounts.getActive(userId, request.accountId);
    let amountOut = request.amount;
    if (account.currency !== request.currency) {
      if (!request.amountOut) {
        throw new AppException(
          'PAYMENT_AMOUNT_OUT_REQUIRED',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Paying in another currency needs the amount that leaves the account',
        );
      }
      amountOut = request.amountOut;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transfer.create({
        data: {
          userId,
          fromAccountId: account.id,
          statementId: row.id,
          amountOut: Money.of(amountOut, account.currency).toString(),
          amountIn: Money.of(request.amount, request.currency).toString(),
          currencyIn: request.currency,
          date: toDbDate(request.date),
          description: 'Pago de tarjeta',
        },
      });
      const updated = await tx.cardStatement.findUniqueOrThrow({
        where: { id },
        include: STATEMENT_PARTS,
      });
      await tx.cardStatement.update({
        where: { id },
        data: { status: statusAfterPayment(statementTotals(updated)) },
      });
    });
    return toStatementSummary(await this.getOwned(userId, id));
  }

  private async getOwned(userId: string, id: string) {
    const row = await this.prisma.cardStatement.findFirst({
      where: { id, userId },
      include: STATEMENT_PARTS,
    });
    if (!row) throw AppException.notFound('Statement not found');
    return row;
  }
}
