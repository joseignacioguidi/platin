import {
  addMonths,
  compareDates,
  daysBetween,
  LocalDate,
  lastDayOf,
  minDate,
  periodOf,
} from './dates';
import { Currency } from './enums';
import { Decimal, DecimalInput, Money, toDecimal } from './money';

/** Units (CEDEARs, shares, fund units, coins) keep 8 decimals, like the column. */
export const UNITS_DECIMALS = 8;

export function roundUnits(value: Decimal): Decimal {
  return value.toDecimalPlaces(UNITS_DECIMALS, Decimal.ROUND_HALF_UP);
}

/** A change in the units of a linked investment: a transfer with units or a correction. */
export interface UnitsChange {
  date: LocalDate;
  direction: 'IN' | 'OUT';
  /** Always positive; the direction gives the sign. */
  units: DecimalInput;
}

const signed = (change: UnitsChange): Decimal =>
  change.direction === 'IN' ? toDecimal(change.units) : toDecimal(change.units).negated();

/**
 * Units of a linked investment at a date (today without `at`): the initial units plus the units
 * of what came in, minus what went out, plus or minus the corrections. Calculated, never stored.
 */
export function holdingUnits(
  initialUnits: DecimalInput,
  changes: readonly UnitsChange[],
  at?: LocalDate,
): Decimal {
  return changes
    .filter((change) => !at || compareDates(change.date, at) <= 0)
    .reduce((units, change) => units.plus(signed(change)), toDecimal(initialUnits));
}

/**
 * The first date the units would be negative, or null if they never are. Within a day what comes
 * in counts before what goes out, so buying and selling the same day is fine.
 */
export function firstNegativeHolding(
  initialUnits: DecimalInput,
  changes: readonly UnitsChange[],
): LocalDate | null {
  const sorted = [...changes].sort(
    (a, b) =>
      compareDates(a.date, b.date) ||
      (a.direction === b.direction ? 0 : a.direction === 'IN' ? -1 : 1),
  );
  let units = toDecimal(initialUnits);
  if (units.isNegative()) return sorted[0]?.date ?? null;
  for (const change of sorted) {
    units = units.plus(signed(change));
    if (units.isNegative()) return change.date;
  }
  return null;
}

/** INV-08: value = units × price, rounded to 2 decimals (half up), in the instrument's currency. */
export function marketValue(units: DecimalInput, price: DecimalInput, currency: Currency): Money {
  return Money.of(toDecimal(units).times(toDecimal(price)), currency);
}

/** INV-09: the units an amount buys at a price (amount ÷ price), with 8 decimals, half up. */
export function unitsForAmount(amount: Money, price: DecimalInput): Decimal {
  const divisor = toDecimal(price);
  if (!divisor.greaterThan(0)) throw new Error('The price has to be positive');
  return roundUnits(amount.amount.dividedBy(divisor));
}

/** INV-12: the terms of a term deposit. */
export interface TermDepositTerms {
  principal: Money;
  /** Nominal annual rate as a ratio: "0.30" = 30 %. */
  tna: DecimalInput;
  startDate: LocalDate;
  endDate: LocalDate;
}

/**
 * INV-12: simple interest. Value at F = principal + principal × TNA × days ÷ 365, with days from
 * the start to F, never past the end date (nor before the start), rounded to 2 decimals.
 */
export function termDepositValue(terms: TermDepositTerms, at: LocalDate): Money {
  const days = Math.max(0, daysBetween(terms.startDate, minDate(at, terms.endDate)));
  const interest = terms.principal.amount.times(toDecimal(terms.tna)).times(days).dividedBy(365);
  return Money.of(terms.principal.amount.plus(interest), terms.principal.currency);
}

/** "Vencido" from the end date on. */
export function termDepositMatured(terms: TermDepositTerms, at: LocalDate): boolean {
  return compareDates(at, terms.endDate) >= 0;
}

export interface TermDepositPosition {
  /** What is left in the term deposit: its value minus what was already redeemed. */
  value: Money;
  matured: boolean;
  /** Everything was taken out: it no longer shows as "Vencido". */
  redeemed: boolean;
}

/**
 * The term deposit as the app shows it at a date. `redeemed` is what went out of the pocket since
 * the start date: redeeming at maturity leaves the value at zero, and the month-end valuation
 * records the interest that was never valued as yield (ADR 0040).
 */
export function termDepositPosition(
  terms: TermDepositTerms,
  redeemed: Money,
  at: LocalDate,
): TermDepositPosition {
  const gross = termDepositValue(terms, at);
  const left = gross.subtract(redeemed);
  const value = left.isNegative() ? Money.zero(gross.currency) : left;
  const done = redeemed.isPositive() && value.isZero();
  return { value, matured: termDepositMatured(terms, at) && !done, redeemed: done };
}

/** An investment with an automatic value (linked or term deposit), for INV-11. */
export interface AutoValuationCandidate {
  pocketId: string;
  /** From when it has an automatic value: valuing it before that makes no sense. */
  since: LocalDate;
  /** Its latest valuation of any source, or null. */
  lastValuation: LocalDate | null;
}

export interface AutoValuationDue {
  pocketId: string;
  /** The last day of the previous month. */
  date: LocalDate;
}

/**
 * INV-11: on the first sync of a month, each automatic investment gets a valuation dated the last
 * day of the previous month, unless it already has one on that date or later, or it did not have
 * an automatic value yet on that date. Idempotent.
 */
export function autoValuationsDue(
  pockets: readonly AutoValuationCandidate[],
  today: LocalDate,
): AutoValuationDue[] {
  const date = lastDayOf(addMonths(periodOf(today), -1));
  return pockets
    .filter(
      (pocket) =>
        compareDates(pocket.since, date) <= 0 &&
        (!pocket.lastValuation || compareDates(pocket.lastValuation, date) < 0),
    )
    .map((pocket) => ({ pocketId: pocket.pocketId, date }));
}
