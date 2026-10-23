import {
  addMonths,
  compareDates,
  dayInPeriod,
  LocalDate,
  maxDate,
  minDate,
  monthsBetween,
  Period,
  periodRange,
} from './dates';
import { Currency, FixedKind } from './enums';
import { Money } from './money';

export interface FixedAmountVersion {
  /** First period this amount applies to. */
  effectiveFrom: Period;
  amount: Money;
}

export interface FixedSchedule {
  kind: FixedKind;
  currency: Currency;
  /** 1 = monthly, 12 = yearly, N = every N months. */
  intervalMonths: number;
  dayOfMonth: number;
  startPeriod: Period;
  /** Last period included (FIJ-03 "finalizar"). */
  endPeriod?: Period | null;
  /** Period the fixed item was paused in: nothing is due from that period on while paused. */
  pausedFrom?: Period | null;
  amounts: readonly FixedAmountVersion[];
}

export interface DueFixedPeriod {
  period: Period;
  /** Expected date of the movement in that period (day clamped to the month length). */
  date: LocalDate;
  amount: Money;
}

/** Amount in force for a period: the version with the latest effectiveFrom ≤ period. */
export function fixedAmountFor(
  amounts: readonly FixedAmountVersion[],
  period: Period,
): Money | undefined {
  let current: FixedAmountVersion | undefined;
  for (const version of amounts) {
    if (compareDates(version.effectiveFrom, period) > 0) continue;
    if (!current || compareDates(version.effectiveFrom, current.effectiveFrom) > 0)
      current = version;
  }
  return current?.amount;
}

/** Whether the fixed item is due in a period, ignoring pause (schedule only). */
export function isScheduledIn(fixed: FixedSchedule, period: Period): boolean {
  const offset = monthsBetween(fixed.startPeriod, period);
  if (offset < 0 || offset % fixed.intervalMonths !== 0) return false;
  return !fixed.endPeriod || compareDates(period, fixed.endPeriod) <= 0;
}

/**
 * Periods in [from, to] in which the fixed item must generate a movement, with the amount in
 * force in each one. Respects frequency, start, end and pause. Past periods keep their old
 * amount after a raise because each period looks up its own version.
 */
export function duePeriods(fixed: FixedSchedule, from: Period, to: Period): DueFixedPeriod[] {
  if (!Number.isInteger(fixed.intervalMonths) || fixed.intervalMonths < 1) {
    throw new Error('intervalMonths must be at least 1');
  }
  let last = to;
  if (fixed.endPeriod) last = minDate(last, fixed.endPeriod);
  if (fixed.pausedFrom) last = minDate(last, addMonths(fixed.pausedFrom, -1));
  const first = maxDate(from, fixed.startPeriod);

  return periodRange(first, last)
    .filter((period) => isScheduledIn(fixed, period))
    .flatMap((period) => {
      const amount = fixedAmountFor(fixed.amounts, period);
      return amount ? [{ period, date: dayInPeriod(period, fixed.dayOfMonth), amount }] : [];
    });
}

/** Next period (≥ from) in which the fixed item is due, if any. */
export function nextDuePeriod(
  fixed: FixedSchedule,
  from: Period,
  horizonMonths = 120,
): DueFixedPeriod | undefined {
  return duePeriods(fixed, from, addMonths(from, horizonMonths))[0];
}
