import { compareDates, LocalDate } from './dates';
import { Currency, TxStatus, TxType } from './enums';
import { DecimalInput, Money } from './money';
import { sumByCurrency } from './exchange';

export interface BalanceTransaction {
  type: TxType;
  status: TxStatus;
  /**
   * In the pocket's currency. Positive for INCOME and EXPENSE (the type gives the sign).
   * ADJUSTMENT and YIELD are the exception: their amount is signed (see docs/adr/0004).
   */
  amount: DecimalInput;
  /** Needed only to cut the balance at a date. */
  date?: LocalDate;
}

export interface BalanceTransfer {
  direction: 'IN' | 'OUT';
  /** Amount in this pocket's currency (amountOut when leaving, amountIn when entering). */
  amount: DecimalInput;
  date?: LocalDate;
}

/** Whether an entry dated `date` counts for a balance at `at` (everything counts without `at`). */
function upTo(date: LocalDate | undefined, at: LocalDate | undefined): boolean {
  return !at || !date || compareDates(date, at) <= 0;
}

/**
 * Pocket balance = initial + confirmed income − confirmed expenses ± adjustments ± yields
 *                  − transfers out + transfers in.
 * Pending movements don't count until they are confirmed. With `at`, only what happened
 * up to that date (included) counts.
 */
export function pocketBalance(
  initial: Money,
  transactions: readonly BalanceTransaction[],
  transfers: readonly BalanceTransfer[],
  at?: LocalDate,
): Money {
  const currency = initial.currency;
  let balance = initial;
  for (const tx of transactions) {
    if (tx.status !== TxStatus.CONFIRMED || !upTo(tx.date, at)) continue;
    const amount = Money.of(tx.amount, currency);
    balance = tx.type === TxType.EXPENSE ? balance.subtract(amount) : balance.add(amount);
  }
  for (const transfer of transfers) {
    if (!upTo(transfer.date, at)) continue;
    const amount = Money.of(transfer.amount, currency);
    balance = transfer.direction === 'IN' ? balance.add(amount) : balance.subtract(amount);
  }
  return balance;
}

export interface PocketForTotals {
  balance: Money;
  archived?: boolean;
}

/**
 * Totals of an account (or of several): the sum of its pockets, one per currency that has a
 * pocket, in the app's order. Archived pockets are left out (they are archived at zero).
 */
export function accountTotals(pockets: readonly PocketForTotals[]): Money[] {
  return sumByCurrency(pockets.filter((pocket) => !pocket.archived).map((p) => p.balance));
}

/**
 * CTA-06: the adjustment needed so the balance matches the real one.
 * Returns undefined when they already match.
 */
export function balanceAdjustment(current: Money, real: Money): Money | undefined {
  const difference = real.subtract(current);
  return difference.isZero() ? undefined : difference;
}

/**
 * Signed effect of a movement on its pocket (for lists and running balances).
 * Pending movements have no effect.
 */
export function transactionEffect(tx: BalanceTransaction, currency: Currency): Money {
  if (tx.status !== TxStatus.CONFIRMED) return Money.zero(currency);
  const amount = Money.of(tx.amount, currency);
  return tx.type === TxType.EXPENSE ? amount.negate() : amount;
}
