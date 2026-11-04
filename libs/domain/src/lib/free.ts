import { compareDates, lastDayOf, LocalDate, Period } from './dates';
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
  /** Installments of this month's card purchases that fall in statements due after the month. */
  cardLater: Money;
}

/**
 * "Libre este mes" (DAS-05, iteration 6): in your accounts + to collect − to pay this month −
 * card in the following months, in base currency. Can be negative.
 */
export function freeThisMonth(input: FreeInput): Money {
  return input.inAccounts.add(input.toCollect).subtract(input.toPay).subtract(input.cardLater);
}

export interface CardInstallment {
  /** Date of the purchase. */
  chargeDate: LocalDate;
  /** Due date of the statement the installment falls in. */
  dueDate: LocalDate;
  /** Value in base currency. */
  value: Money;
}

/**
 * DAS-05: installments of the card purchases made in `period` that fall in statements due after
 * it. What is due within the month is already in "to pay", so nothing counts twice.
 */
export function cardLater(
  installments: readonly CardInstallment[],
  period: Period,
  base: Currency,
): Money {
  const end = lastDayOf(period);
  return Money.sum(
    installments
      .filter((i) => i.chargeDate.startsWith(period) && compareDates(i.dueDate, end) > 0)
      .map((i) => i.value),
    base,
  );
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
