import { Injectable } from '@nestjs/common';
import { LocalDate, Money, pocketBalance } from '@platin/domain';
import { toDbDate } from '../common/serialize';
import type { Pocket as PocketRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** What a balance needs from a pocket. */
export type PocketForBalance = Pick<PocketRow, 'id' | 'currency' | 'initialBalance'>;

/**
 * Balances are calculated, never stored: initial balance + confirmed movements ± adjustments
 * ± yields ± transfers, aggregated per pocket in three queries.
 */
@Injectable()
export class PocketBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Balance of each pocket; with `at`, only what happened up to that date (included). */
  async balances(
    userId: string,
    pockets: readonly PocketForBalance[],
    at?: LocalDate,
  ): Promise<Map<string, Money>> {
    const ids = pockets.map((pocket) => pocket.id);
    if (ids.length === 0) return new Map();
    const until = at ? { date: { lte: toDbDate(at) } } : {};

    const [movements, outgoing, incoming] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['pocketId', 'type'],
        where: { userId, pocketId: { in: ids }, status: 'CONFIRMED', ...until },
        _sum: { amount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromPocketId'],
        where: { userId, fromPocketId: { in: ids }, ...until },
        _sum: { amountOut: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['toPocketId'],
        where: { userId, toPocketId: { in: ids }, ...until },
        _sum: { amountIn: true },
      }),
    ]);

    const result = new Map<string, Money>();
    for (const pocket of pockets) {
      result.set(
        pocket.id,
        pocketBalance(
          Money.of(pocket.initialBalance.toFixed(2), pocket.currency),
          movements
            .filter((m) => m.pocketId === pocket.id)
            .map((m) => ({
              type: m.type,
              status: 'CONFIRMED' as const,
              amount: (m._sum.amount ?? 0).toFixed(2),
            })),
          [
            ...outgoing
              .filter((t) => t.fromPocketId === pocket.id)
              .map((t) => ({
                direction: 'OUT' as const,
                amount: (t._sum.amountOut ?? 0).toFixed(2),
              })),
            ...incoming
              .filter((t) => t.toPocketId === pocket.id)
              .map((t) => ({
                direction: 'IN' as const,
                amount: (t._sum.amountIn ?? 0).toFixed(2),
              })),
          ],
        ),
      );
    }
    return result;
  }

  async balance(userId: string, pocket: PocketForBalance, at?: LocalDate): Promise<Money> {
    const balances = await this.balances(userId, [pocket], at);
    return balances.get(pocket.id) ?? Money.zero(pocket.currency);
  }
}
