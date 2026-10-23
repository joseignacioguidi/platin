import { addMonths, compareDates, dayInPeriod, LocalDate, Period, periodOf } from './dates';

export interface CardCycle {
  /** Day of the month the statement closes (1-31). */
  closingDay: number;
  /** Day of the month the statement is due (1-31). */
  dueDay: number;
}

export interface StatementDates {
  closingDate: LocalDate;
  dueDate: LocalDate;
}

/** Statement dates that were corrected by hand (TAR-06), by period. They win over the calculation. */
export type StatementOverrides = ReadonlyMap<Period, StatementDates>;

/**
 * Default dates of the statement of a period (the month it closes in):
 * - closing: the card's closing day in that month, or the last day if the month is shorter;
 * - due: the first due day strictly after the closing date.
 */
export function buildStatementDates(card: CardCycle, period: Period): StatementDates {
  assertDay(card.closingDay, 'closingDay');
  assertDay(card.dueDay, 'dueDay');
  const closingDate = dayInPeriod(period, card.closingDay);
  const sameMonthDue = dayInPeriod(period, card.dueDay);
  const dueDate =
    compareDates(sameMonthDue, closingDate) > 0
      ? sameMonthDue
      : dayInPeriod(addMonths(period, 1), card.dueDay);
  return { closingDate, dueDate };
}

/** Dates of a statement, using the manual correction if there is one. */
export function statementDatesFor(
  card: CardCycle,
  period: Period,
  overrides: StatementOverrides = new Map(),
): StatementDates {
  return overrides.get(period) ?? buildStatementDates(card, period);
}

/**
 * The statement a purchase falls into: the first statement whose closing date is on or after
 * the purchase date. A purchase on the closing day belongs to that statement; the day after,
 * to the next one. Corrected dates are respected (a closing moved into the next month still
 * collects purchases until that date).
 */
export function statementPeriodFor(
  card: CardCycle,
  purchaseDate: LocalDate,
  overrides: StatementOverrides = new Map(),
): Period {
  const purchasePeriod = periodOf(purchaseDate);
  for (let offset = -1; offset <= 2; offset++) {
    const period = addMonths(purchasePeriod, offset);
    const { closingDate } = statementDatesFor(card, period, overrides);
    if (compareDates(purchaseDate, closingDate) <= 0) return period;
  }
  // Only reachable with overrides that move closings backwards by months.
  throw new Error(`No statement found for purchase on ${purchaseDate}`);
}

function assertDay(day: number, name: string): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${name} must be an integer between 1 and 31`);
  }
}
