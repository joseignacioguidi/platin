import {
  CardCurrency,
  Currency,
  isCardCurrency,
  LocalDate,
  localDateToUtc,
  Period,
  periodToUtc,
  utcToLocalDate,
} from '@platin/domain';

/** Anything Prisma returns for a Decimal column. */
export interface DecimalLike {
  toFixed(digits: number): string;
}

/** Decimal column → JSON amount string ("18500.00"). */
export function money(value: DecimalLike): string {
  return value.toFixed(2);
}

/** Decimal column → JSON rate string ("1250.500000"). */
export function rate(value: DecimalLike): string {
  return value.toFixed(6);
}

/** `@db.Date` column → "YYYY-MM-DD". */
export function date(value: Date): LocalDate {
  return utcToLocalDate(value);
}

/** "YYYY-MM-DD" → value for a `@db.Date` column. */
export function toDbDate(value: LocalDate): Date {
  return localDateToUtc(value);
}

/** "YYYY-MM" → first day of the month, as stored for periods. */
export function toDbPeriod(value: Period): Date {
  return periodToUtc(value);
}

/**
 * A currency of a card row (charge, installment, adjustment, card fixed item): only ARS or USD,
 * guaranteed by the check constraints of the database (MON-05).
 */
export function cardCurrency(value: Currency): CardCurrency {
  if (!isCardCurrency(value)) throw new Error(`Card rows can't be in ${value}`);
  return value;
}

/** The base currency of a user: ARS or USD (check constraint on User). */
export const baseCurrency = cardCurrency;
