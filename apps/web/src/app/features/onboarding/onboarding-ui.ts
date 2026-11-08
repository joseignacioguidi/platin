/** The amount boxes of the mockups: a field with the currency in front. */
export const AMOUNT_BOX =
  'flex min-h-12 min-w-0 items-center gap-1.5 rounded-[14px] bg-field px-3.5 focus-within:outline-2 focus-within:outline-brand';

export const AMOUNT_INPUT =
  'min-h-11 min-w-0 flex-1 self-stretch border-0 bg-transparent text-right font-amount text-base text-ink placeholder:text-muted focus:outline-none';

/** A small numeric field ("día", "voy por la"). */
export const NUMBER_INPUT =
  'min-h-12 w-full min-w-0 rounded-[14px] bg-field px-3 text-center font-amount text-base text-ink placeholder:text-muted focus:outline-2 focus:outline-brand';

export const TEXT_INPUT =
  'min-h-12 w-full min-w-0 rounded-[14px] bg-field px-3.5 text-base text-ink placeholder:text-muted focus:outline-2 focus:outline-brand';

export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');
}

/** A whole day of the month typed in a field, or null. */
export function parseDay(value: string | number): number | null {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}
