import DecimalJs from 'decimal.js';
import { Currency } from './enums';

/** decimal.js configured for money: high precision, half-up rounding. */
export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

export type DecimalInput = string | Decimal;

const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

/** Parses a decimal string. `number` is not accepted on purpose: amounts never go through floats. */
export function toDecimal(value: DecimalInput): Decimal {
  if (typeof value === 'string') {
    if (!AMOUNT_RE.test(value)) throw new Error(`Invalid decimal: "${value}"`);
    return new Decimal(value);
  }
  return new Decimal(value);
}

/** Rounds to 2 decimals, half up (away from zero on .5). */
export function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Rounds a rate to 6 decimals, the precision stored for exchange rates. */
export function round6(value: Decimal): Decimal {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/**
 * An immutable amount of money in a currency, always rounded to cents.
 * Signed: business amounts are stored positive, but intermediate results
 * (differences, balances) can be negative.
 */
export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  static of(amount: DecimalInput, currency: Currency): Money {
    return new Money(round2(toDecimal(amount)), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  /** Sums amounts of one currency. Requires the currency for the empty case. */
  static sum(items: readonly Money[], currency: Currency): Money {
    return items.reduce((total, item) => total.add(item), Money.zero(currency));
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  /** Multiplies by a factor (for example, months), rounding the result to cents. */
  times(factor: DecimalInput | number): Money {
    const value = typeof factor === 'number' ? new Decimal(factor) : toDecimal(factor);
    return new Money(round2(this.amount.times(value)), this.currency);
  }

  /** Converts to another currency multiplying by `rate` (units of target per unit of this). */
  convert(rate: DecimalInput, target: Currency): Money {
    return new Money(round2(this.amount.times(toDecimal(rate))), target);
  }

  /**
   * Splits into `parts` amounts of total / parts rounded to cents;
   * the rounding difference goes to the last part, so they always add up.
   */
  split(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts < 1) throw new Error(`Invalid number of parts: ${parts}`);
    const each = round2(this.amount.dividedBy(parts));
    const last = this.amount.minus(each.times(parts - 1));
    return Array.from(
      { length: parts },
      (_, i) => new Money(i === parts - 1 ? last : each, this.currency),
    );
  }

  negate(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.amount.comparedTo(other.amount) as -1 | 0 | 1;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0;
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0;
  }

  max(other: Money): Money {
    return this.compare(other) >= 0 ? this : other;
  }

  min(other: Money): Money {
    return this.compare(other) <= 0 ? this : other;
  }

  /** Decimal string with 2 decimals, the JSON format: "18500.00". */
  toString(): string {
    return this.amount.toFixed(2);
  }

  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.toString(), currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

export interface FormatMoneyOptions {
  /** Show cents. Defaults to true; "auto" hides them for whole amounts. */
  decimals?: boolean | 'auto';
  /** Prefix + or − explicitly. */
  signDisplay?: 'auto' | 'always' | 'never';
}

const SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'USD' };

/**
 * Formats with es-AR conventions: "$ 18.500,00", "USD 771,43".
 * Implemented by hand so it is identical in Node and every browser.
 */
export function formatMoney(money: Money, options: FormatMoneyOptions = {}): string {
  const { decimals = true, signDisplay = 'auto' } = options;
  const abs = money.amount.abs();
  const showCents = decimals === 'auto' ? !abs.isInteger() : decimals;
  const fixed = showCents ? abs.toFixed(2) : abs.toFixed(0, Decimal.ROUND_HALF_UP);
  const [integer, cents] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = `${SYMBOL[money.currency]} ${grouped}${cents ? `,${cents}` : ''}`;
  if (signDisplay === 'never' || money.isZero()) return body;
  if (money.isNegative()) return `−${body}`;
  return signDisplay === 'always' ? `+${body}` : body;
}
