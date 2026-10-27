import { addDays, dateParts, LocalDate, Period, periodParts } from '@platin/domain';

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
