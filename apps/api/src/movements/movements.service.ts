import { Injectable } from '@nestjs/common';
import type {
  ColorToken,
  Movement,
  MovementsPage,
  MovementsQuery,
  MovementsSummary,
} from '@platin/contracts';
import {
  Currency,
  firstDayOf,
  lastDayOf,
  Money,
  Period,
  transferIntent,
  utcToLocalDate,
  utcToPeriod,
  valueIn,
} from '@platin/domain';
import {
  afterCursor,
  compareByCursorOrder,
  Cursor,
  decodeCursor,
  encodeCursor,
} from '../common/cursor';
import { date, money, rate, toDbDate } from '../common/serialize';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRates } from '../rates/user-rates.service';
import { toTransferDto } from '../transfers/transfers.service';

type ParsedQuery = Omit<MovementsQuery, 'limit'> & { limit: number; period?: Period };

const pocketRef = {
  select: {
    id: true,
    name: true,
    kind: true,
    currency: true,
    accountId: true,
    account: { select: { name: true } },
  },
} as const;

interface PocketRefRow {
  id: string;
  name: string;
  currency: Currency;
  accountId: string;
  account: { name: string };
}

/** "Mercado Pago · Disponible" as the contracts expect it. */
function toPocketRef(row: PocketRefRow) {
  return {
    id: row.id,
    name: row.name,
    accountId: row.accountId,
    accountName: row.account.name,
    currency: row.currency,
  };
}

/**
 * MOV-03: one list with incomes, expenses, adjustments, transfers and card purchases, newest
 * first, filtered and paginated by cursor. Each source is queried with the same cursor and the
 * pages merged.
 */
@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: UserRates,
  ) {}

  async list(userId: string, query: ParsedQuery): Promise<MovementsPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const take = query.limit + 1;
    const range = query.period
      ? { gte: toDbDate(firstDayOf(query.period)), lte: toDbDate(lastDayOf(query.period)) }
      : undefined;

    const wantsTransactions = query.type !== 'TRANSFER' && query.type !== 'CARD' && !query.cardId;
    const wantsTransfers =
      (query.type === undefined || query.type === 'TRANSFER') &&
      !query.categoryId &&
      query.status !== 'PENDING';
    // Card purchases are expenses; they never belong to a pocket (their payment does).
    const wantsCharges =
      (query.type === undefined || query.type === 'EXPENSE' || query.type === 'CARD') &&
      !query.accountId &&
      !query.pocketId &&
      query.status !== 'PENDING';

    const [transactions, transfers, charges] = await Promise.all([
      wantsTransactions ? this.findTransactions(userId, query, range, cursor, take) : [],
      wantsTransfers ? this.findTransfers(userId, query, range, cursor, take) : [],
      wantsCharges ? this.findCharges(userId, query, range, cursor, take) : [],
    ]);

    const merged: { key: Cursor; movement: Movement }[] = [
      ...transactions.map((row) => ({
        key: row,
        movement: {
          kind: 'TRANSACTION' as const,
          id: row.id,
          type: row.type,
          status: row.status,
          origin: row.origin,
          date: date(row.date),
          amount: money(row.amount),
          currency: row.currency,
          baseAmount: money(row.baseAmount),
          rateToBase: rate(row.rateToBase),
          description: row.description,
          pocket: toPocketRef(row.pocket),
          category: row.category
            ? { ...row.category, color: row.category.color as ColorToken }
            : null,
        },
      })),
      ...transfers.map((row) => {
        const intent = row.toPocket ? transferIntent(row.fromPocket.kind, row.toPocket.kind) : null;
        const dto = toTransferDto(row, row.fromPocket.currency, intent);
        return {
          key: row,
          movement: {
            kind: 'TRANSFER' as const,
            id: dto.id,
            date: dto.date,
            amountOut: dto.amountOut,
            currencyOut: dto.currencyOut,
            amountIn: dto.amountIn,
            currencyIn: dto.currencyIn,
            impliedRate: dto.impliedRate,
            description: dto.description,
            fromPocket: toPocketRef(row.fromPocket),
            toPocket: row.toPocket ? toPocketRef(row.toPocket) : null,
            intent,
            statement: row.statement
              ? {
                  id: row.statement.id,
                  cardId: row.statement.card.id,
                  cardName: row.statement.card.name,
                  period: utcToPeriod(row.statement.period),
                }
              : null,
          },
        };
      }),
      ...charges.map((row) => ({
        key: row,
        movement: {
          kind: 'CARD_CHARGE' as const,
          id: row.id,
          date: date(row.date),
          description: row.description,
          totalAmount: money(row.totalAmount),
          currency: row.currency,
          installmentsCount: row.installmentsCount,
          startInstallment: row.startInstallment,
          card: row.card,
          category: { ...row.category, color: row.category.color as ColorToken },
        },
      })),
    ].sort((a, b) => compareByCursorOrder(a.key, b.key));

    const page = merged.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((entry) => entry.movement),
      nextCursor:
        merged.length > query.limit && last
          ? encodeCursor({ date: last.key.date, createdAt: last.key.createdAt, id: last.key.id })
          : null,
    };
  }

  /**
   * Confirmed income and expenses of a month in base currency; pending ones only counted.
   * Card purchases count on their purchase date; in another currency, valued with the rate of
   * that date.
   */
  async summary(userId: string, period: Period): Promise<MovementsSummary> {
    const range = { gte: toDbDate(firstDayOf(period)), lte: toDbDate(lastDayOf(period)) };
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const [sums, cardSpending, pendingCount, foreignCharges] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, date: range, status: 'CONFIRMED', type: { in: ['INCOME', 'EXPENSE'] } },
        _sum: { baseAmount: true },
      }),
      this.prisma.cardCharge.aggregate({
        where: { userId, date: range, currency: user.baseCurrency },
        _sum: { totalAmount: true },
      }),
      this.prisma.transaction.count({ where: { userId, date: range, status: 'PENDING' } }),
      this.prisma.cardCharge.findMany({
        where: { userId, date: range, currency: { not: user.baseCurrency } },
        select: { totalAmount: true, currency: true, date: true },
      }),
    ]);
    const sumOf = (type: 'INCOME' | 'EXPENSE') =>
      Money.of(
        (sums.find((s) => s.type === type)?._sum.baseAmount ?? 0).toFixed(2),
        user.baseCurrency,
      ).toString();
    let expense = Money.of(sumOf('EXPENSE'), user.baseCurrency).add(
      Money.of((cardSpending._sum.totalAmount ?? 0).toFixed(2), user.baseCurrency),
    );
    for (const charge of foreignCharges) {
      const rate = await this.rates.sellFor(userId, utcToLocalDate(charge.date));
      if (rate) {
        const amount = Money.of(charge.totalAmount.toFixed(2), charge.currency);
        expense = expense.add(valueIn(amount, user.baseCurrency, rate));
      }
    }
    return {
      period,
      currency: user.baseCurrency,
      income: sumOf('INCOME'),
      expense: expense.toString(),
      pendingCount,
    };
  }

  private findTransactions(
    userId: string,
    query: ParsedQuery,
    range: Prisma.DateTimeFilter | undefined,
    cursor: Cursor | undefined,
    take: number,
  ) {
    const filters: Prisma.TransactionWhereInput = { userId };
    if (range) filters.date = range;
    if (query.accountId) filters.pocket = { accountId: query.accountId };
    if (query.pocketId) filters.pocketId = query.pocketId;
    if (query.categoryId) filters.categoryId = query.categoryId;
    if (query.type === 'INCOME' || query.type === 'EXPENSE') filters.type = query.type;
    if (query.status) filters.status = query.status;
    if (query.q) filters.OR = this.transactionSearch(query.q);
    return this.prisma.transaction.findMany({
      where: { AND: [filters, afterCursor(cursor)] },
      include: {
        pocket: pocketRef,
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private findTransfers(
    userId: string,
    query: ParsedQuery,
    range: Prisma.DateTimeFilter | undefined,
    cursor: Cursor | undefined,
    take: number,
  ) {
    const filters: Prisma.TransferWhereInput = { userId };
    if (range) filters.date = range;
    if (query.accountId) {
      filters.OR = [
        { fromPocket: { accountId: query.accountId } },
        { toPocket: { accountId: query.accountId } },
      ];
    }
    if (query.pocketId) {
      filters.AND = [{ OR: [{ fromPocketId: query.pocketId }, { toPocketId: query.pocketId }] }];
    }
    if (query.cardId) filters.statement = { cardId: query.cardId };
    if (query.q) filters.description = { contains: query.q, mode: 'insensitive' };
    return this.prisma.transfer.findMany({
      where: { AND: [filters, afterCursor(cursor)] },
      include: {
        fromPocket: pocketRef,
        toPocket: pocketRef,
        statement: {
          select: { id: true, period: true, card: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private findCharges(
    userId: string,
    query: ParsedQuery,
    range: Prisma.DateTimeFilter | undefined,
    cursor: Cursor | undefined,
    take: number,
  ) {
    const filters: Prisma.CardChargeWhereInput = { userId };
    if (range) filters.date = range;
    if (query.cardId) filters.cardId = query.cardId;
    if (query.categoryId) filters.categoryId = query.categoryId;
    if (query.q) {
      filters.OR = [
        { description: { contains: query.q, mode: 'insensitive' } },
        { category: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.cardCharge.findMany({
      where: { AND: [filters, afterCursor(cursor)] },
      include: {
        card: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }

  private transactionSearch(q: string): Prisma.TransactionWhereInput[] {
    return [
      { description: { contains: q, mode: 'insensitive' } },
      { category: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }
}
