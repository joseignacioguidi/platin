import { Currency, TxStatus, TxType } from './enums';
import { DecimalInput, Money } from './money';

export interface BalanceTransaction {
  type: TxType;
  status: TxStatus;
  /**
   * In the account currency. Positive for INCOME and EXPENSE (the type gives the sign).
   * ADJUSTMENT is the exception: its amount is signed (see docs/adr/0004).
   */
  amount: DecimalInput;
}

export interface BalanceTransfer {
  /** Amount in this account's currency (amountOut when leaving, amountIn when entering). */
  amount: DecimalInput;
}

export interface AccountBalanceInput {
  currency: Currency;
  initialBalance: DecimalInput;
  transactions: readonly BalanceTransaction[];
  transfersOut: readonly BalanceTransfer[];
  transfersIn: readonly BalanceTransfer[];
}

/**
 * Balance = initial + confirmed income − confirmed expenses ± adjustments
 *           − transfers out + transfers in.
 * Pending movements don't count until they are confirmed.
 */
export function accountBalance(input: AccountBalanceInput): Money {
  const { currency } = input;
  let balance = Money.of(input.initialBalance, currency);
  for (const tx of input.transactions) {
    if (tx.status !== TxStatus.CONFIRMED) continue;
    const amount = Money.of(tx.amount, currency);
    if (tx.type === TxType.INCOME || tx.type === TxType.ADJUSTMENT) balance = balance.add(amount);
    else balance = balance.subtract(amount);
  }
  for (const transfer of input.transfersOut)
    balance = balance.subtract(Money.of(transfer.amount, currency));
  for (const transfer of input.transfersIn)
    balance = balance.add(Money.of(transfer.amount, currency));
  return balance;
}

/**
 * CTA-04: the adjustment needed so the balance matches the real one.
 * Returns undefined when they already match.
 */
export function balanceAdjustment(current: Money, real: Money): Money | undefined {
  const difference = real.subtract(current);
  return difference.isZero() ? undefined : difference;
}

/**
 * Signed effect of a movement on its account (for lists and running balances).
 * Pending movements have no effect.
 */
export function transactionEffect(tx: BalanceTransaction, currency: Currency): Money {
  if (tx.status !== TxStatus.CONFIRMED) return Money.zero(currency);
  const amount = Money.of(tx.amount, currency);
  return tx.type === TxType.EXPENSE ? amount.negate() : amount;
}
