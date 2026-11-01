import { Currency, PocketKind } from './enums';
import { canConvert, RatesInput, valueIn } from './exchange';
import { Money } from './money';

/**
 * "Libre este mes" of the home screen (DAS-05): expected income − committed − spent − separated,
 * in base currency. Can be negative.
 */
export function freeThisMonth(
  expectedIncome: Money,
  committed: Money,
  spent: Money,
  separated: Money = Money.zero(expectedIncome.currency),
): Money {
  return expectedIncome.subtract(committed).subtract(spent).subtract(separated);
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

export interface SeparatedTransfer {
  fromPocketId: string;
  toPocketId: string | null;
  /** Value in base currency (see transferBaseValue). */
  value: Money;
}

const isSeparated = (kind: PocketKind | undefined) =>
  kind === PocketKind.SAVINGS || kind === PocketKind.INVESTMENT;

/**
 * DAS-05: what the user set apart this month to save or invest. Transfers from an available
 * pocket to a savings or investment one add; the ones coming back subtract. Transfers between two
 * available pockets, or between savings and investment pockets, don't count: the money keeps its
 * purpose. Statement payments (no destination pocket) don't count either.
 */
export function separatedThisMonth(
  transfers: readonly SeparatedTransfer[],
  pocketKinds: ReadonlyMap<string, PocketKind>,
  base: Currency,
): Money {
  let total = Money.zero(base);
  for (const transfer of transfers) {
    if (!transfer.toPocketId) continue;
    const from = pocketKinds.get(transfer.fromPocketId);
    const to = pocketKinds.get(transfer.toPocketId);
    if (from === PocketKind.AVAILABLE && isSeparated(to)) total = total.add(transfer.value);
    else if (isSeparated(from) && to === PocketKind.AVAILABLE)
      total = total.subtract(transfer.value);
  }
  return total;
}
