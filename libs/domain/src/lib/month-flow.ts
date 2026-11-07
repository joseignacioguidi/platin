import { Currency } from './enums';
import { canConvert, RatesInput, valueIn } from './exchange';
import { freeThisMonth } from './free';
import { Money } from './money';

/**
 * What happened in the month to the account balances and spending reserves of one currency,
 * in that currency. Transfers between two of those pockets in the same currency cancel out and
 * are left out.
 */
export interface MonthFlowCurrency {
  currency: Currency;
  /** Balance at the end of the last day of the previous month. */
  opening: Money;
  /** Confirmed incomes of the month. */
  income: Money;
  /** Confirmed expenses of the month. */
  expenses: Money;
  /** Card statement payments of the month. */
  statementPayments: Money;
  /** Moved to savings or investment reserves. */
  toReserves: Money;
  /** Taken back from savings or investment reserves. */
  fromReserves: Money;
  /** Balance adjustments and yields, signed. */
  adjustments: Money;
  /** Money changed to or from another currency within these pockets: in minus out, signed. */
  exchanged: Money;
  /** Balance now (or at the end of the last day of a past month). */
  closing: Money;
}

export interface MonthFlowInput {
  base: Currency;
  /** Today's rates: the whole month is valued with them, as "en tus cuentas". */
  rates: RatesInput | null | undefined;
  currencies: readonly MonthFlowCurrency[];
  /**
   * "En tus cuentas" in base currency, pocket by pocket with today's rates. The free amount comes
   * from it, so it stays the same number as ever (DAS-05).
   */
  inAccounts: Money;
  /** Zero for a previous month. */
  toCollect: Money;
  /** Zero for a previous month. */
  toPay: Money;
}

/** "Cómo se llega al libre", all in base currency. */
export interface MonthFlow {
  opening: Money;
  /** Collected this month (confirmed incomes). */
  received: Money;
  toCollect: Money;
  paidOut: Money;
  /** To savings and investment reserves minus what came back (can be negative). */
  reserved: Money;
  /** Adjustments and the difference left by changing currencies (signed). */
  other: Money;
  toPay: Money;
  inAccounts: Money;
  free: Money;
}

/** The month flow doesn't close: some movement of the month was left out of the input. */
export class MonthFlowMismatchError extends Error {
  constructor(
    readonly currency: Currency,
    readonly expected: Money,
    readonly closing: Money,
  ) {
    super(`The month flow in ${currency} reaches ${expected} instead of ${closing}`);
  }
}

/** opening + income − expenses − payments − to reserves + from reserves + adjustments + exchanged. */
function expectedClosing(flow: MonthFlowCurrency): Money {
  return flow.opening
    .add(flow.income)
    .subtract(flow.expenses)
    .subtract(flow.statementPayments)
    .subtract(flow.toReserves)
    .add(flow.fromReserves)
    .add(flow.adjustments)
    .add(flow.exchanged);
}

/**
 * DAS-05, "Cómo se llega al libre": the month as a current account that closes exactly.
 *
 * Each currency must close on its own (otherwise MonthFlowMismatchError). Then every part is
 * valued with today's rates; the cents that rounding each part leaves against "en tus cuentas"
 * go to "otros", so that, in base currency,
 *   opening + received + toCollect + other = paidOut + reserved + toPay + free
 * holds always. A currency without a usable rate is worth zero, as in "en tus cuentas".
 */
export function monthFlow(input: MonthFlowInput): MonthFlow {
  const { base, rates } = input;
  const value = (money: Money) =>
    canConvert(money.currency, base, rates)
      ? valueIn(money, base, rates as RatesInput)
      : Money.zero(base);

  let opening = Money.zero(base);
  let received = Money.zero(base);
  let paidOut = Money.zero(base);
  let reserved = Money.zero(base);
  for (const flow of input.currencies) {
    const expected = expectedClosing(flow);
    if (!expected.equals(flow.closing)) {
      throw new MonthFlowMismatchError(flow.currency, expected, flow.closing);
    }
    opening = opening.add(value(flow.opening));
    received = received.add(value(flow.income));
    paidOut = paidOut.add(value(flow.expenses.add(flow.statementPayments)));
    reserved = reserved.add(value(flow.toReserves.subtract(flow.fromReserves)));
  }
  const other = input.inAccounts.subtract(opening).subtract(received).add(paidOut).add(reserved);
  const free = freeThisMonth(input);

  const had = opening.add(received).add(input.toCollect).add(other);
  const went = paidOut.add(reserved).add(input.toPay).add(free);
  if (!had.equals(went)) throw new Error(`The month flow doesn't close: ${had} ≠ ${went}`);

  return {
    opening,
    received,
    toCollect: input.toCollect,
    paidOut,
    reserved,
    other,
    toPay: input.toPay,
    inAccounts: input.inAccounts,
    free,
  };
}
