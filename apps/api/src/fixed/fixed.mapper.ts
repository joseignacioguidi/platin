import type { ColorToken, FixedItem } from '@platin/contracts';
import {
  fixedAmountFor,
  FixedSchedule,
  Money,
  nextDuePeriod,
  Period,
  utcToPeriod,
} from '@platin/domain';
import { money } from '../common/serialize';
import type { Prisma } from '../generated/prisma/client';

export const FIXED_INCLUDE = {
  amounts: { orderBy: { effectiveFrom: 'asc' } },
  category: { select: { id: true, name: true, icon: true, color: true } },
  account: { select: { id: true, name: true } },
} as const;

export type FixedRow = Prisma.FixedItemGetPayload<{ include: typeof FIXED_INCLUDE }>;

/** The schedule libs/domain works with. */
export function toSchedule(row: FixedRow): FixedSchedule {
  return {
    kind: row.kind,
    currency: row.currency,
    intervalMonths: row.intervalMonths,
    dayOfMonth: row.dayOfMonth,
    startPeriod: utcToPeriod(row.startPeriod),
    endPeriod: row.endPeriod ? utcToPeriod(row.endPeriod) : null,
    pausedFrom: row.pausedAt ? utcToPeriod(row.pausedAt) : null,
    amounts: row.amounts.map((a) => ({
      effectiveFrom: utcToPeriod(a.effectiveFrom),
      amount: Money.of(a.amount.toFixed(2), row.currency),
    })),
  };
}

export function toFixedDto(row: FixedRow, currentPeriod: Period): FixedItem {
  const schedule = toSchedule(row);
  const next = nextDuePeriod(schedule, currentPeriod);
  const current =
    fixedAmountFor(schedule.amounts, currentPeriod) ??
    schedule.amounts[0]?.amount ??
    Money.zero(row.currency);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    category: { ...row.category, color: row.category.color as ColorToken },
    account: row.account,
    currency: row.currency,
    intervalMonths: row.intervalMonths,
    dayOfMonth: row.dayOfMonth,
    startPeriod: schedule.startPeriod,
    endPeriod: schedule.endPeriod ?? null,
    paused: row.pausedAt !== null,
    currentAmount: current.toString(),
    amounts: row.amounts.map((a) => ({
      amount: money(a.amount),
      effectiveFrom: utcToPeriod(a.effectiveFrom),
    })),
    next: next ? { period: next.period, date: next.date, amount: next.amount.toString() } : null,
  };
}
