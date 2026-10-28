import { addDays, LocalDate } from './dates';

export interface DatedNotice {
  text: string;
  startsOn: LocalDate | null;
  endsOn: LocalDate | null;
}

/** An announcement is shown when it has text and today is inside its dates (both inclusive). */
export function isAnnouncementActive(notice: DatedNotice, today: LocalDate): boolean {
  if (!notice.text.trim()) return false;
  if (notice.startsOn && today < notice.startsOn) return false;
  if (notice.endsOn && today > notice.endsOn) return false;
  return true;
}

/** The Monday of the week of a date. */
export function weekStart(date: LocalDate): LocalDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** Counts per week (Monday to Sunday) for the `weeks` weeks ending in today's, oldest first. */
export function countByWeek(
  dates: readonly LocalDate[],
  today: LocalDate,
  weeks: number,
): { weekStart: LocalDate; count: number }[] {
  const current = weekStart(today);
  const buckets = Array.from({ length: weeks }, (_, index) => ({
    weekStart: addDays(current, -7 * (weeks - 1 - index)),
    count: 0,
  }));
  const index = new Map(buckets.map((bucket, i) => [bucket.weekStart, i]));
  for (const date of dates) {
    const i = index.get(weekStart(date));
    if (i !== undefined) buckets[i].count += 1;
  }
  return buckets;
}
