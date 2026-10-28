import type { Transaction } from '@platin/contracts';
import { date, money, rate } from '../common/serialize';
import type { Transaction as TransactionRow } from '../generated/prisma/client';

export function toTransactionDto(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    origin: row.origin,
    pocketId: row.pocketId,
    categoryId: row.categoryId,
    amount: money(row.amount),
    currency: row.currency,
    rateToBase: rate(row.rateToBase),
    baseAmount: money(row.baseAmount),
    date: date(row.date),
    description: row.description,
  };
}
