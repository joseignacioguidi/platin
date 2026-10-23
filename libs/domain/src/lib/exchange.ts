import { Currency } from './enums';
import { Decimal, DecimalInput, Money, round2, round6, toDecimal } from './money';

/**
 * Exchange rates are expressed as ARS per 1 USD (what DolarApi returns).
 * Valuations use the sell price.
 */

export interface BaseConversion {
  /** Factor to go from the movement currency to the base currency, frozen at 6 decimals. */
  rateToBase: string;
  /** Amount in base currency, frozen at 2 decimals. */
  baseAmount: Money;
}

/** Units of `to` per unit of `from`, given ARS per USD. Not rounded. */
export function conversionFactor(from: Currency, to: Currency, arsPerUsd: DecimalInput): Decimal {
  if (from === to) return new Decimal(1);
  const rate = toDecimal(arsPerUsd);
  if (!rate.isPositive() || rate.isZero()) throw new Error('The exchange rate must be positive');
  return from === Currency.USD ? rate : new Decimal(1).dividedBy(rate);
}

/**
 * Freezes the base-currency value of a movement.
 * The base amount uses the exact factor (not the rounded one), so USD base users
 * don't lose precision from 1 / rate.
 */
export function toBase(amount: Money, base: Currency, arsPerUsd: DecimalInput): BaseConversion {
  const factor = conversionFactor(amount.currency, base, arsPerUsd);
  return {
    rateToBase: round6(factor).toFixed(6),
    baseAmount: Money.of(round2(amount.amount.times(factor)), base),
  };
}

/** Values money in another currency with the rate of the day (for totals, not for history). */
export function valueIn(amount: Money, target: Currency, arsPerUsd: DecimalInput): Money {
  return Money.of(
    round2(amount.amount.times(conversionFactor(amount.currency, target, arsPerUsd))),
    target,
  );
}

/**
 * The rate implied by a transfer between currencies (buying or selling dollars):
 * ARS per USD, from the two amounts the user typed. Undefined for same-currency transfers.
 */
export function impliedRate(amountOut: Money, amountIn: Money): string | undefined {
  if (amountOut.currency === amountIn.currency) return undefined;
  const [ars, usd] =
    amountOut.currency === Currency.ARS ? [amountOut, amountIn] : [amountIn, amountOut];
  if (usd.isZero() || usd.isNegative()) throw new Error('The USD amount must be positive');
  return round6(ars.amount.dividedBy(usd.amount)).toFixed(6);
}

/** Totals per currency, plus everything valued in the base currency. */
export interface CurrencyTotals {
  ARS: Money;
  USD: Money;
  base: Money;
}

export function totalsByCurrency(
  items: readonly Money[],
  base: Currency,
  arsPerUsd: DecimalInput,
): CurrencyTotals {
  const ARS = Money.sum(
    items.filter((m) => m.currency === Currency.ARS),
    Currency.ARS,
  );
  const USD = Money.sum(
    items.filter((m) => m.currency === Currency.USD),
    Currency.USD,
  );
  return { ARS, USD, base: valueIn(ARS, base, arsPerUsd).add(valueIn(USD, base, arsPerUsd)) };
}
