import { addMonths, Period } from './dates';
import { Currency } from './enums';
import { Money } from './money';

export interface InstallmentAmount {
  /** 1-based installment number ("3 de 12"). */
  number: number;
  amount: Money;
}

export interface ScheduledInstallment extends InstallmentAmount {
  /** Period of the statement the installment belongs to. */
  period: Period;
}

/**
 * Amounts of a purchase in `count` installments: total / count rounded to cents,
 * with the rounding difference in the last installment.
 * With `startAt` = k ("voy por la k de N") only installments k..N are returned;
 * their amounts are the same they would have in the full plan.
 */
export function splitInstallments(total: Money, count: number, startAt = 1): InstallmentAmount[] {
  if (!Number.isInteger(count) || count < 1)
    throw new Error('The number of installments must be at least 1');
  if (!Number.isInteger(startAt) || startAt < 1 || startAt > count) {
    throw new Error(`The starting installment must be between 1 and ${count}`);
  }
  if (!total.isPositive()) throw new Error('The total must be positive');
  return total
    .split(count)
    .map((amount, i) => ({ number: i + 1, amount }))
    .filter((installment) => installment.number >= startAt);
}

/**
 * TAR-02 "por cuota": the total of a purchase loaded with the installment as the bank shows it.
 * total = installment × count, so splitting it back gives exactly that installment every time.
 */
export function totalFromInstallment(installment: Money, count: number): Money {
  if (!Number.isInteger(count) || count < 1)
    throw new Error('The number of installments must be at least 1');
  if (!installment.isPositive()) throw new Error('The installment must be positive');
  return installment.times(count);
}

/**
 * Places each installment in a statement: the first one in `firstPeriod`,
 * each following one in the next statement.
 */
export function scheduleInstallments(
  installments: readonly InstallmentAmount[],
  firstPeriod: Period,
): ScheduledInstallment[] {
  return installments.map((installment, i) => ({
    ...installment,
    period: addMonths(firstPeriod, i),
  }));
}

export interface InstallmentState {
  number: number;
  amount: Money;
  /** Whether its statement is already closed (closed, partially paid or paid). */
  inClosedStatement: boolean;
}

export interface InstallmentProgress {
  count: number;
  /** Highest installment number already in a closed statement (0 if none). */
  current: number;
  remainingCount: number;
  remainingAmount: Money;
}

/**
 * Remaining installments = N minus installments in closed statements;
 * remaining amount = sum of those installments.
 */
export function installmentProgress(
  count: number,
  installments: readonly InstallmentState[],
  currency: Currency,
): InstallmentProgress {
  const closed = installments.filter((i) => i.inClosedStatement);
  const open = installments.filter((i) => !i.inClosedStatement);
  // A plan migrated as "k of N" starts at k: installments before k are already paid.
  const firstNumber = installments.reduce((min, i) => Math.min(min, i.number), count + 1);
  const paidBeforeTracking = Math.max(0, firstNumber - 1);
  const current = closed.reduce((max, i) => Math.max(max, i.number), paidBeforeTracking);
  return {
    count,
    current,
    remainingCount: count - paidBeforeTracking - closed.length,
    remainingAmount: Money.sum(
      open.map((i) => i.amount),
      currency,
    ),
  };
}

/**
 * "Cuotas más usadas" (TAR-02): the two most frequent installment counts of a card's recent
 * purchases (1 payment counts as 1). Ties go to the lower count; with fewer than two, `defaults`
 * fill in without repeating. Returned from lower to higher, as the picker shows them (ADR 0030).
 */
export function topInstallmentCounts(
  counts: readonly number[],
  defaults: readonly [number, number] = [1, 3],
): [number, number] {
  const frequency = new Map<number, number>();
  for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
  const ranked = [...frequency.entries()]
    .sort(([a, fa], [b, fb]) => fb - fa || a - b)
    .map(([count]) => count);
  const top = [...new Set([...ranked.slice(0, 2), ...defaults])].slice(0, 2);
  return [Math.min(top[0], top[1]), Math.max(top[0], top[1])];
}

/**
 * Installments that can be regenerated when a charge is edited:
 * only the ones whose statement is still open.
 */
export function regenerableInstallments<T extends { inClosedStatement: boolean }>(
  installments: readonly T[],
): T[] {
  return installments.filter((i) => !i.inClosedStatement);
}
