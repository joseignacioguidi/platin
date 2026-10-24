import { Injectable } from '@nestjs/common';
import type {
  ColorToken,
  Movement,
  MovementsPage,
  MovementsQuery,
  MovementsSummary,
} from '@platin/contracts';
import { firstDayOf, lastDayOf, Money, Period } from '@platin/domain';
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
import { toTransferDto } from '../transfers/transfers.service';

type ParsedQuery = Omit<MovementsQuery, 'limit'> & { limit: number; period?: Period };

const accountRef = { select: { id: true, name: true, currency: true } } as const;

/**
 * MOV-03: one list with incomes, expenses, adjustments and transfers, newest first, filtered
 * and paginated by cursor. Each source is queried with the same cursor and the pages merged.
 */
@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ParsedQuery): Promise<MovementsPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const take = query.limit + 1;
    const range = query.period
      ? { gte: toDbDate(firstDayOf(query.period)), lte: toDbDate(lastDayOf(query.period)) }
      : undefined;

    const wantsTransactions = query.type !== 'TRANSFER';
    const wantsTransfers =
      (query.type === undefined || query.type === 'TRANSFER') &&
      !query.categoryId &&
      query.status !== 'PENDING';

    const [transactions, transfers] = await Promise.all([
      wantsTransactions ? this.findTransactions(userId, query, range, cursor, take) : [],
      wantsTransfers ? this.findTransfers(userId, query, range, cursor, take) : [],
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
          account: row.account,
          category: row.category
            ? { ...row.category, color: row.category.color as ColorToken }
            : null,
        },
      })),
      ...transfers.map((row) => {
        const dto = toTransferDto(row, row.fromAccount.currency);
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
            fromAccount: row.fromAccount,
            toAccount: row.toAccount,
          },
        };
      }),
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

  /** Confirmed income and expenses of a month in base currency; pending ones only counted. */
  async summary(userId: string, period: Period): Promise<MovementsSummary> {
    const range = { gte: toDbDate(firstDayOf(period)), lte: toDbDate(lastDayOf(period)) };
    const [user, sums, pendingCount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { userId, date: range, status: 'CONFIRMED', type: { in: ['INCOME', 'EXPENSE'] } },
        _sum: { baseAmount: true },
      }),
      this.prisma.transaction.count({ where: { userId, date: range, status: 'PENDING' } }),
    ]);
    const sumOf = (type: 'INCOME' | 'EXPENSE') =>
      Money.of(
        (sums.find((s) => s.type === type)?._sum.baseAmount ?? 0).toFixed(2),
        user.baseCurrency,
      ).toString();
    return {
      period,
      currency: user.baseCurrency,
      income: sumOf('INCOME'),
      expense: sumOf('EXPENSE'),
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
    if (query.accountId) filters.accountId = query.accountId;
    if (query.categoryId) filters.categoryId = query.categoryId;
    if (query.type === 'INCOME' || query.type === 'EXPENSE') filters.type = query.type;
    if (query.status) filters.status = query.status;
    if (query.q) filters.OR = this.transactionSearch(query.q);
    return this.prisma.transaction.findMany({
      where: { AND: [filters, afterCursor(cursor)] },
      include: {
        account: accountRef,
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
      filters.OR = [{ fromAccountId: query.accountId }, { toAccountId: query.accountId }];
    }
    if (query.q) filters.description = { contains: query.q, mode: 'insensitive' };
    return this.prisma.transfer.findMany({
      where: { AND: [filters, afterCursor(cursor)] },
      include: { fromAccount: accountRef, toAccount: accountRef },
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
