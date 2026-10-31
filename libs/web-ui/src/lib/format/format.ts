import {
  addDays,
  Currency,
  dateParts,
  LocalDate,
  Period,
  periodParts,
  toDecimal,
} from '@platin/domain';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "2026-10" → "Octubre 2026". */
export function formatPeriod(period: Period): string {
  const { year, month } = periodParts(period);
  return `${capitalize(MONTHS[month - 1])} ${year}`;
}

/** "2026-10" → "oct 2026" (short, for compact labels). */
export function formatPeriodShort(period: Period): string {
  const { year, month } = periodParts(period);
  return `${MONTHS[month - 1].slice(0, 3)} ${year}`;
}

export function weekday(date: LocalDate): string {
  const { year, month, day } = dateParts(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** Day header of a list: "Hoy · jueves 23", "Ayer · miércoles 22", "Lunes 20", "3 de septiembre". */
export function formatDayHeader(date: LocalDate, today: LocalDate): string {
  const { day, month, year } = dateParts(date);
  if (date === today) return `Hoy · ${weekday(date)} ${day}`;
  if (date === addDays(today, -1)) return `Ayer · ${weekday(date)} ${day}`;
  const sameMonth = date.slice(0, 7) === today.slice(0, 7);
  if (sameMonth) return `${capitalize(weekday(date))} ${day}`;
  const sameYear = year === dateParts(today).year;
  return `${day} de ${MONTHS[month - 1]}${sameYear ? '' : ` de ${year}`}`;
}

/** "2026-11-05" → "05 NOV" parts for date badges. */
export function dateBadge(date: LocalDate): { day: string; month: string } {
  const { day, month } = dateParts(date);
  return { day: String(day).padStart(2, '0'), month: MONTHS[month - 1].slice(0, 3).toUpperCase() };
}

/** "2026-10-23" → "23/10/2026". */
export function formatDate(date: LocalDate): string {
  const { day, month, year } = dateParts(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** Field text of a date: "Hoy", "Ayer", "lunes 27 de octubre" (year added when it isn't this year's). */
export function formatLongDate(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Hoy';
  if (date === addDays(today, -1)) return 'Ayer';
  const { day, month, year } = dateParts(date);
  const sameYear = year === dateParts(today).year;
  return `${weekday(date)} ${day} de ${MONTHS[month - 1]}${sameYear ? '' : ` de ${year}`}`;
}

/** "Octubre 2026" for a year and month (1-12). */
export function formatMonthYear(year: number, month: number): string {
  return `${capitalize(MONTHS[month - 1])} ${year}`;
}

const SINGULAR: Record<Currency, string> = {
  ARS: 'peso',
  USD: 'dólar',
  EUR: 'euro',
  BRL: 'real',
  CLP: 'peso chileno',
  UYU: 'peso uruguayo',
};

/** "1.680" or "1,65": up to `decimals` places, without trailing zeros, es-AR grouping. */
function rateNumber(rate: string, decimals: number): string {
  const fixed = toDecimal(rate).toDecimalPlaces(decimals).toFixed();
  const [integer, fraction] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}

/**
 * A rate as the user reads it (MON-02): "$ 1.680 por euro" when one side is the peso, or
 * "1 EUR = 1,08 USD" between two other currencies. `rate` follows libs/domain: pesos per unit of
 * the other currency, or units of `to` per unit of `from`.
 */
export function formatRate(from: Currency, to: Currency, rate: string): string {
  const other = from === 'ARS' ? to : to === 'ARS' ? from : null;
  if (other) return `$ ${rateNumber(rate, 2)} por ${SINGULAR[other]}`;
  return `1 ${from} = ${rateNumber(rate, 4)} ${to}`;
}

/** "pesos por euro", for the label of a rate input. */
export function rateUnit(currency: Currency, base: Currency): string {
  if (currency === 'ARS') return `pesos por ${SINGULAR[base]}`;
  if (base === 'ARS') return `pesos por ${SINGULAR[currency]}`;
  return `${base} por ${currency}`;
}
