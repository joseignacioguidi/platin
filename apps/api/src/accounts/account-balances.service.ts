import { Injectable } from '@nestjs/common';
import { accountBalance, Money } from '@platin/domain';
import type { Account as AccountRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Balances are calculated, never stored: initial balance + confirmed movements ± adjustments
 * ± transfers, aggregated per account in three queries.
 */
@Injectable()
export class AccountBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  async balances(userId: string, accounts: readonly AccountRow[]): Promise<Map<string, Money>> {
    const ids = accounts.map((account) => account.id);
    if (ids.length === 0) return new Map();

    const [movements, outgoing, incoming] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { userId, accountId: { in: ids }, status: 'CONFIRMED' },
        _sum: { amount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: { userId, fromAccountId: { in: ids } },
        _sum: { amountOut: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: { userId, toAccountId: { in: ids } },
        _sum: { amountIn: true },
      }),
    ]);

    const result = new Map<string, Money>();
    for (const account of accounts) {
      result.set(
        account.id,
        accountBalance({
          currency: account.currency,
          initialBalance: account.initialBalance.toFixed(2),
          transactions: movements
            .filter((m) => m.accountId === account.id)
            .map((m) => ({
              type: m.type,
              status: 'CONFIRMED' as const,
              amount: (m._sum.amount ?? 0).toFixed(2),
            })),
          transfersOut: outgoing
            .filter((t) => t.fromAccountId === account.id)
            .map((t) => ({ amount: (t._sum.amountOut ?? 0).toFixed(2) })),
          transfersIn: incoming
            .filter((t) => t.toAccountId === account.id)
            .map((t) => ({ amount: (t._sum.amountIn ?? 0).toFixed(2) })),
        }),
      );
    }
    return result;
  }

  async balance(userId: string, account: AccountRow): Promise<Money> {
    const balances = await this.balances(userId, [account]);
    return balances.get(account.id) ?? Money.zero(account.currency);
  }
}
