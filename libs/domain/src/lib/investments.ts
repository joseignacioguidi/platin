import {
  addMonths,
  compareDates,
  dateParts,
  daysInMonth,
  LocalDate,
  makeLocalDate,
  makePeriod,
  periodParts,
} from './dates';
import { BalanceTransfer } from './balance';
import { Decimal, DecimalInput, Money } from './money';

/**
 * INV-04: updating an investment to a value V on a date F yields V − (balance calculated at F),
 * positive or negative. After it, the pocket's balance is exactly V.
 */
export function yieldFromValuation(balanceAt: Money, value: Money): Money {
  return value.subtract(balanceAt);
}

export interface InvestmentPocketInput {
  /** Balance the pocket started with: it counts as money invested. */
  initialBalance: Money;
  /** Current calculated balance (= current value after the last valuation). */
  balance: Money;
}

export interface InvestmentYield {
  /** Signed, in the pocket's currency. */
  amount: DecimalInput;
}

export interface InvestmentSummary {
  /** Initial balance + transfers in − transfers out. */
  investedNet: Money;
  currentValue: Money;
  /** Sum of the yields of its valuations. */
  accumulatedYield: Money;
  /** accumulatedYield / investedNet as a ratio with 4 decimals; null without money invested. */
  yieldRate: string | null;
  /** Yield of the last valuation (zero without valuations). */
  lastYield: Money;
}

/**
 * INV-05: invested net, current value and yields of an investment pocket, in its currency.
 * Yields come oldest first; the last one is the "last period" yield.
 */
export function investmentSummary(
  pocket: InvestmentPocketInput,
  transfers: readonly BalanceTransfer[],
  yields: readonly InvestmentYield[],
): InvestmentSummary {
  const currency = pocket.balance.currency;
  let investedNet = pocket.initialBalance;
  for (const transfer of transfers) {
    const amount = Money.of(transfer.amount, currency);
    investedNet =
      transfer.direction === 'IN' ? investedNet.add(amount) : investedNet.subtract(amount);
  }
  const accumulatedYield = Money.sum(
    yields.map((y) => Money.of(y.amount, currency)),
    currency,
  );
  const yieldRate = investedNet.amount.greaterThan(0)
    ? accumulatedYield.amount.dividedBy(investedNet.amount).toFixed(4, Decimal.ROUND_HALF_UP)
    : null;
  const last = yields.at(-1);
  return {
    investedNet,
    currentValue: pocket.balance,
    accumulatedYield,
    yieldRate,
    lastYield: last ? Money.of(last.amount, currency) : Money.zero(currency),
  };
}

/** The same day one month later, clamped to the month's length (31 Jan → 28/29 Feb). */
export function oneMonthAfter(date: LocalDate): LocalDate {
  const { year, month, day } = dateParts(date);
  const next = periodParts(addMonths(makePeriod(year, month), 1));
  return makeLocalDate(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month)));
}

/** INV-03: the home suggests updating values when more than a month passed since `last`. */
export function valuationOverdue(last: LocalDate, today: LocalDate): boolean {
  return compareDates(today, oneMonthAfter(last)) > 0;
}
