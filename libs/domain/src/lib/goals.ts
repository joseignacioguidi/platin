import { addMonths, compareDates, LocalDate, monthsBetween, Period, periodOf } from './dates';
import { Currency } from './enums';
import { convert, RatesInput } from './exchange';
import { Decimal, DecimalInput, Money, round2, toDecimal } from './money';

export interface GoalPlan {
  targetAmount: Money;
  targetPeriod: Period;
  /** Period the goal was created in: the plan starts there. */
  startPeriod: Period;
}

export type GoalPace = 'AHEAD' | 'BEHIND' | 'ON_TRACK';

export interface GoalProjection {
  accumulated: Money;
  /** Never negative: 0 once the target is reached. */
  remaining: Money;
  /** accumulated / target, as a ratio with 4 decimals ("0.2800"), capped at 1. */
  progress: string;
  /** Months from the next month to the target month, both included (minimum 1). */
  monthsLeft: number;
  /** remaining / monthsLeft. */
  monthlyNeeded: Money;
  /** target × elapsed / total months of the plan. */
  expectedToDate: Money;
  pace: GoalPace;
  /** |accumulated − expected|. */
  paceDifference: Money;
  simulation?: GoalSimulation;
}

export interface GoalSimulation {
  monthly: Money;
  /** ceil(remaining / monthly). 0 if already reached. */
  monthsNeeded: number;
  /** Period in which the goal is reached with that contribution. */
  reachedIn: Period;
  /** Months before (positive) or after (negative) the target period. */
  monthsBeforeTarget: number;
}

/**
 * Projection of a savings goal (MET-03, MET-04):
 * - months left = months between the month after today and the target month, both included (min 1);
 * - monthly needed = remaining / months left;
 * - pace: the plan spans every month from the start month to the target month (both included),
 *   and by today it expected target × (full months elapsed before the current one) / total.
 */
export function goalProjection(
  goal: GoalPlan,
  accumulated: Money,
  today: LocalDate,
  monthly?: Money,
): GoalProjection {
  const currency = goal.targetAmount.currency;
  if (accumulated.currency !== currency)
    throw new Error('The accumulated amount must be in the goal currency');
  if (!goal.targetAmount.isPositive()) throw new Error('The target amount must be positive');

  const currentPeriod = periodOf(today);
  const remaining = goal.targetAmount.subtract(accumulated).max(Money.zero(currency));
  const monthsLeft = Math.max(1, monthsBetween(currentPeriod, goal.targetPeriod));
  const monthlyNeeded = Money.of(round2(remaining.amount.dividedBy(monthsLeft)), currency);

  const totalMonths = Math.max(1, monthsBetween(goal.startPeriod, goal.targetPeriod) + 1);
  const elapsed = Math.min(
    totalMonths,
    Math.max(0, monthsBetween(goal.startPeriod, currentPeriod)),
  );
  const expectedToDate = Money.of(
    round2(goal.targetAmount.amount.times(elapsed).dividedBy(totalMonths)),
    currency,
  );
  const comparison = accumulated.compare(expectedToDate);
  const pace: GoalPace = comparison > 0 ? 'AHEAD' : comparison < 0 ? 'BEHIND' : 'ON_TRACK';

  const ratio = accumulated.amount.dividedBy(goal.targetAmount.amount);
  const progress = Decimal.min(Decimal.max(ratio, 0), 1).toFixed(4, Decimal.ROUND_HALF_UP);

  return {
    accumulated,
    remaining,
    progress,
    monthsLeft,
    monthlyNeeded,
    expectedToDate,
    pace,
    paceDifference: accumulated.subtract(expectedToDate).abs(),
    ...(monthly ? { simulation: simulateGoal(goal, remaining, currentPeriod, monthly) } : {}),
  };
}

/** MET-04: with `monthly` per month, months needed = ceil(remaining / monthly). */
export function simulateGoal(
  goal: GoalPlan,
  remaining: Money,
  currentPeriod: Period,
  monthly: Money,
): GoalSimulation {
  if (!monthly.isPositive()) throw new Error('The monthly contribution must be positive');
  const monthsNeeded = remaining.isZero()
    ? 0
    : remaining.amount.dividedBy(monthly.amount).toDecimalPlaces(0, Decimal.ROUND_CEIL).toNumber();
  const reachedIn = addMonths(currentPeriod, monthsNeeded);
  return {
    monthly,
    monthsNeeded,
    reachedIn,
    monthsBeforeTarget: monthsBetween(reachedIn, goal.targetPeriod),
  };
}

export interface GoalAccountBalance {
  balance: Money;
}

/**
 * Accumulated for a goal: sum of the linked accounts' balances converted to the goal currency,
 * or the sum of assigned contributions if the goal has no linked accounts.
 */
export function goalAccumulated(
  currency: Currency,
  linkedAccounts: readonly GoalAccountBalance[],
  contributions: readonly Money[],
  rates: RatesInput,
): Money {
  if (linkedAccounts.length > 0) {
    return Money.sum(
      linkedAccounts.map(({ balance }) => convert(balance, currency, rates)),
      currency,
    );
  }
  return Money.sum(
    contributions.map((c) => convert(c, currency, rates)),
    currency,
  );
}

/** Whether a goal's deadline is over (target month already passed). */
export function isGoalOverdue(goal: GoalPlan, today: LocalDate): boolean {
  return compareDates(periodOf(today), goal.targetPeriod) > 0;
}

/** Percentage (0-100, rounded) from a progress ratio string. */
export function progressPercent(progress: DecimalInput): number {
  return toDecimal(progress).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
