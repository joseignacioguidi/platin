import { Currency } from './enums';
import { Decimal, DecimalInput, Money, round2, round6, toDecimal } from './money';

/**
 * Every rate is stored against the peso: ARS per 1 unit of a currency (what DolarApi returns).
 * Between two currencies that aren't the peso, the conversion goes through it:
 * EUR → USD = (ARS per EUR) / (ARS per USD). Valuations use the sell price.
 */

/** ARS per 1 unit of each currency. The peso itself is always 1 and can be left out. */
export type RateTable = Partial<Record<Currency, DecimalInput>>;

/**
 * Rates for a conversion: a table, or a single rate typed by the user. A single rate is the
 * pesos per unit of the other currency when one side is the peso (ARS per USD, ARS per EUR);
 * between two other currencies, units of the target per unit of the source.
 */
export type RatesInput = DecimalInput | RateTable;

export interface BaseConversion {
  /** Factor to go from the movement currency to the base currency, frozen at 6 decimals. */
  rateToBase: string;
  /** Amount in base currency, frozen at 2 decimals. */
  baseAmount: Money;
}

function isTable(rates: RatesInput): rates is RateTable {
  return typeof rates === 'object' && !(rates instanceof Decimal);
}

function positive(value: DecimalInput, what: string): Decimal {
  const rate = toDecimal(value);
  if (!rate.isPositive() || rate.isZero()) throw new Error(`The ${what} rate must be positive`);
  return rate;
}

/** Pesos per unit of a currency in a table; throws when the table doesn't have it. */
function arsPer(currency: Currency, table: RateTable): Decimal {
  if (currency === Currency.ARS) return new Decimal(1);
  const rate = table[currency];
  if (rate === undefined || rate === null) throw new Error(`There is no ${currency} rate`);
  return positive(rate, currency);
}

/** Whether the rates can convert between these currencies (a table may lack one). */
export function canConvert(
  from: Currency,
  to: Currency,
  rates: RatesInput | null | undefined,
): boolean {
  if (from === to) return true;
  if (rates === null || rates === undefined) return false;
  if (!isTable(rates)) return true;
  return [from, to].every(
    (c) => c === Currency.ARS || (rates[c] !== undefined && rates[c] !== null),
  );
}

/** Units of `to` per unit of `from`. Not rounded. */
export function conversionFactor(from: Currency, to: Currency, rates: RatesInput): Decimal {
  if (from === to) return new Decimal(1);
  if (isTable(rates)) return arsPer(from, rates).dividedBy(arsPer(to, rates));
  const rate = positive(rates, 'exchange');
  if (to === Currency.ARS) return rate;
  if (from === Currency.ARS) return new Decimal(1).dividedBy(rate);
  return rate;
}

/**
 * Freezes the base-currency value of a movement.
 * The base amount uses the exact factor (not the rounded one), so USD base users
 * don't lose precision from 1 / rate.
 */
export function toBase(amount: Money, base: Currency, rates: RatesInput): BaseConversion {
  const factor = conversionFactor(amount.currency, base, rates);
  return {
    rateToBase: round6(factor).toFixed(6),
    baseAmount: Money.of(round2(amount.amount.times(factor)), base),
  };
}

/** Converts money to any currency with the rates (for totals, not for history). */
export function convert(amount: Money, to: Currency, rates: RatesInput): Money {
  return Money.of(round2(amount.amount.times(conversionFactor(amount.currency, to, rates))), to);
}

/** Same as `convert`; kept for the places that value totals. */
export const valueIn = convert;

/**
 * The rate implied by a transfer between currencies (buying or selling dollars, euros...),
 * from the two amounts the user typed: pesos per unit of the other currency when one side is
 * the peso; otherwise units received per unit sent. Undefined for same-currency transfers.
 */
export function impliedRate(amountOut: Money, amountIn: Money): string | undefined {
  if (amountOut.currency === amountIn.currency) return undefined;
  const [numerator, denominator] =
    amountOut.currency === Currency.ARS
      ? [amountOut, amountIn]
      : amountIn.currency === Currency.ARS
        ? [amountIn, amountOut]
        : [amountIn, amountOut];
  if (denominator.isZero() || denominator.isNegative()) {
    throw new Error(`The ${denominator.currency} amount must be positive`);
  }
  return round6(numerator.amount.dividedBy(denominator.amount)).toFixed(6);
}

/**
 * Totals per currency (only the currencies that appear, in the app's order), plus everything
 * valued in the base currency (MON-03). A currency the rates can't convert (a table without
 * it: no rate known yet) stays in its own line but is left out of the base total.
 */
export interface CurrencyTotals {
  byCurrency: Money[];
  base: Money;
}

export function sumByCurrency(items: readonly Money[]): Money[] {
  const sums = new Map<Currency, Money>();
  for (const item of items) {
    sums.set(item.currency, (sums.get(item.currency) ?? Money.zero(item.currency)).add(item));
  }
  return Object.values(Currency)
    .filter((currency) => sums.has(currency))
    .map((currency) => sums.get(currency) as Money);
}

export function totalsByCurrency(
  items: readonly Money[],
  base: Currency,
  rates: RatesInput,
): CurrencyTotals {
  const byCurrency = sumByCurrency(items);
  return {
    byCurrency,
    base: Money.sum(
      byCurrency
        .filter((money) => canConvert(money.currency, base, rates))
        .map((money) => convert(money, base, rates)),
      base,
    ),
  };
}

/** The total of one currency in a list (zero when it isn't there). */
export function amountIn(totals: readonly Money[], currency: Currency): Money {
  return totals.find((money) => money.currency === currency) ?? Money.zero(currency);
}
