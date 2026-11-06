import {
  compareDates,
  daysBetween,
  daysInPeriod,
  lastDayOf,
  LocalDate,
  Period,
  periodOf,
} from './dates';
import { Currency, PocketKind } from './enums';
import { canConvert, RatesInput, valueIn } from './exchange';
import { Money } from './money';

export interface FreeInput {
  /** Today's balance of account balances and spending reserves, in base currency. */
  inAccounts: Money;
  /** Unconfirmed fixed and scheduled incomes of the month. */
  toCollect: Money;
  /** What is still to pay this month (commitmentsByMonth). */
  toPay: Money;
}

/**
 * "Libre este mes" (DAS-05): in your accounts + to collect − to pay this month, in base currency.
 * Card installments due after the month are paid with later months' money (ADR 0029). Can be
 * negative.
 */
export function freeThisMonth(input: FreeInput): Money {
  return input.inAccounts.add(input.toCollect).subtract(input.toPay);
}

/**
 * Value of a transfer in base currency. Transfers don't freeze a rate, so (ADR 0021):
 * - if one side is in base currency, that side is the exact amount;
 * - otherwise the amount out is valued with `rates` (the caller passes the rate of the
 *   transfer's date). Without a usable rate it is worth zero.
 */
export function transferBaseValue(
  amountOut: Money,
  amountIn: Money,
  base: Currency,
  rates: RatesInput | null | undefined,
): Money {
  if (amountOut.currency === base) return amountOut;
  if (amountIn.currency === base) return amountIn;
  return canConvert(amountOut.currency, base, rates)
    ? valueIn(amountOut, base, rates as RatesInput)
    : Money.zero(base);
}

export interface SavedTransfer {
  fromKind: PocketKind;
  /** Null for a statement payment. */
  toKind: PocketKind | null;
  /** Value in base currency (see transferBaseValue). */
  value: Money;
}

const isSpendable = (kind: PocketKind | null) =>
  kind === PocketKind.AVAILABLE || kind === PocketKind.SPENDING;
const isStored = (kind: PocketKind | null) =>
  kind === PocketKind.SAVINGS || kind === PocketKind.INVESTMENT;

/**
 * DAS-05: saved or invested this month, shown apart from the free amount. Transfers from an
 * account balance or a spending reserve to savings or investments add; the ones coming back
 * subtract. The rest (between accounts, statement payments...) don't count.
 */
export function savedThisMonth(transfers: readonly SavedTransfer[], base: Currency): Money {
  let total = Money.zero(base);
  for (const { fromKind, toKind, value } of transfers) {
    if (isSpendable(fromKind) && isStored(toKind)) total = total.add(value);
    else if (isStored(fromKind) && isSpendable(toKind)) total = total.subtract(value);
  }
  return total;
}

/**
 * Days left in `period` counting `today`: the whole month for a future one, zero for a past one.
 */
export function daysLeftIn(period: Period, today: LocalDate): number {
  const current = periodOf(today);
  if (compareDates(period, current) < 0) return 0;
  if (compareDates(period, current) > 0) return daysInPeriod(period);
  return daysBetween(today, lastDayOf(period)) + 1;
}

/**
 * "Por día" (DAS-07): free ÷ days left in the month counting today, rounded down to whole units.
 * Null when the free amount is zero or negative, or when the period already passed.
 */
export function freePerDay(free: Money, today: LocalDate, period: Period): Money | null {
  const days = daysLeftIn(period, today);
  if (days === 0 || !free.isPositive()) return null;
  return Money.of(free.amount.dividedBy(days).floor(), free.currency);
}

export interface AccountCoverage {
  /** What the account has to spend covers what it pays this month. */
  covered: boolean;
  /** What is missing to cover it (zero when covered). */
  shortfall: Money;
}

/**
 * DAS-07: an account covers its payments of the month when what it has to spend (balance +
 * spending reserves) is at least what it still pays this month.
 */
export function accountCoverage(spendable: Money, toPay: Money): AccountCoverage {
  const shortfall = toPay.subtract(spendable);
  return shortfall.isPositive()
    ? { covered: false, shortfall }
    : { covered: true, shortfall: Money.zero(toPay.currency) };
}
