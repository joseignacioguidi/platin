/**
 * Business dates without time zones.
 * - LocalDate: 'YYYY-MM-DD'
 * - Period: 'YYYY-MM' (a calendar month; stored in the database as its first day)
 */

export type LocalDate = string & { readonly __brand: 'LocalDate' };
export type Period = string & { readonly __brand: 'Period' };

export const APP_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_RE = /^(\d{4})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isLocalDate(value: string): value is LocalDate {
  const match = LOCAL_DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function isPeriod(value: string): value is Period {
  const match = PERIOD_RE.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function parseLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new Error(`Invalid date: ${value} (expected YYYY-MM-DD)`);
  return value;
}

export function parsePeriod(value: string): Period {
  if (!isPeriod(value)) throw new Error(`Invalid period: ${value} (expected YYYY-MM)`);
  return value;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  return parseLocalDate(`${pad(year, 4)}-${pad(month)}-${pad(day)}`);
}

export function makePeriod(year: number, month: number): Period {
  return parsePeriod(`${pad(year, 4)}-${pad(month)}`);
}

export function dateParts(date: LocalDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

export function periodParts(period: Period): { year: number; month: number } {
  const [year, month] = period.split('-').map(Number);
  return { year, month };
}

/** The period a date belongs to. */
export function periodOf(date: LocalDate): Period {
  return date.slice(0, 7) as Period;
}

/** First day of the period, as stored in the database. */
export function firstDayOf(period: Period): LocalDate {
  return `${period}-01` as LocalDate;
}

export function lastDayOf(period: Period): LocalDate {
  const { year, month } = periodParts(period);
  return makeLocalDate(year, month, daysInMonth(year, month));
}

export function daysInPeriod(period: Period): number {
  const { year, month } = periodParts(period);
  return daysInMonth(year, month);
}

/** The given day of the period, or its last day if the month is shorter (31 → Feb 28). */
export function dayInPeriod(period: Period, day: number): LocalDate {
  if (!Number.isInteger(day) || day < 1 || day > 31)
    throw new Error(`Invalid day of month: ${day}`);
  const { year, month } = periodParts(period);
  return makeLocalDate(year, month, Math.min(day, daysInMonth(year, month)));
}

export function addMonths(period: Period, months: number): Period {
  const { year, month } = periodParts(period);
  const index = year * 12 + (month - 1) + months;
  return makePeriod(Math.floor(index / 12), (index % 12) + 1);
}

/** Number of month steps from `from` to `to` (negative if `to` is earlier). */
export function monthsBetween(from: Period, to: Period): number {
  const a = periodParts(from);
  const b = periodParts(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Inclusive list of periods from `from` to `to`. Empty if `to` is before `from`. */
export function periodRange(from: Period, to: Period): Period[] {
  const count = monthsBetween(from, to);
  return Array.from({ length: Math.max(0, count + 1) }, (_, i) => addMonths(from, i));
}

function toUtcDays(date: LocalDate): number {
  const { year, month, day } = dateParts(date);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function fromUtcDays(days: number): LocalDate {
  const d = new Date(days * 86_400_000);
  return makeLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcDays(toUtcDays(date) + days);
}

/** Days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toUtcDays(to) - toUtcDays(from);
}

/** Works for both LocalDate and Period, since both sort lexicographically. */
export function compareDates<T extends LocalDate | Period>(a: T, b: T): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate<T extends LocalDate | Period>(a: T, b: T): T {
  return a >= b ? a : b;
}

export function minDate<T extends LocalDate | Period>(a: T, b: T): T {
  return a <= b ? a : b;
}

/**
 * The calendar date of an instant in a time zone. Pure: the instant is a parameter.
 * The API's ClockService passes "now"; business rules receive the resulting LocalDate.
 */
export function localDateAt(instant: Date, timeZone: string = APP_TIME_ZONE): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return parseLocalDate(`${get('year')}-${get('month')}-${get('day')}`);
}

/** A LocalDate as a UTC midnight Date, the form Prisma uses for `@db.Date` columns. */
export function localDateToUtc(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Reads a `@db.Date` value (UTC midnight) back as a LocalDate. */
export function utcToLocalDate(value: Date): LocalDate {
  return parseLocalDate(value.toISOString().slice(0, 10));
}

export function periodToUtc(period: Period): Date {
  return localDateToUtc(firstDayOf(period));
}

export function utcToPeriod(value: Date): Period {
  return periodOf(utcToLocalDate(value));
}

/** The instant a calendar day starts in a time zone (midnight in Buenos Aires is 03:00 UTC). */
export function startOfDayIn(date: LocalDate, timeZone: string = APP_TIME_ZONE): Date {
  const utcMidnight = localDateToUtc(date).getTime();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMidnight));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallClock = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(utcMidnight - (wallClock - utcMidnight));
}
