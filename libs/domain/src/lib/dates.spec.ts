import {
  addDays,
  addMonths,
  dayInPeriod,
  daysBetween,
  firstDayOf,
  isLocalDate,
  isPeriod,
  lastDayOf,
  localDateAt,
  localDateToUtc,
  monthsBetween,
  periodOf,
  periodRange,
  startOfDayIn,
  utcToLocalDate,
} from './dates';
import { d, p } from './test-helpers';

describe('dates', () => {
  it('validates dates and periods', () => {
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-1-01')).toBe(false);
    expect(isPeriod('2026-10')).toBe(true);
    expect(isPeriod('2026-00')).toBe(false);
  });

  it('adds months across years', () => {
    expect(addMonths(p('2026-11'), 3)).toBe('2027-02');
    expect(addMonths(p('2026-01'), -1)).toBe('2025-12');
    expect(addMonths(p('2026-10'), 0)).toBe('2026-10');
  });

  it('counts months between periods', () => {
    expect(monthsBetween(p('2026-10'), p('2027-12'))).toBe(14);
    expect(monthsBetween(p('2027-12'), p('2026-10'))).toBe(-14);
  });

  it('lists periods inclusively', () => {
    expect(periodRange(p('2026-11'), p('2027-01'))).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(periodRange(p('2026-11'), p('2026-10'))).toEqual([]);
  });

  it('clamps a day to the month length', () => {
    expect(dayInPeriod(p('2026-02'), 31)).toBe('2026-02-28');
    expect(dayInPeriod(p('2028-02'), 31)).toBe('2028-02-29');
    expect(dayInPeriod(p('2026-04'), 31)).toBe('2026-04-30');
    expect(dayInPeriod(p('2026-10'), 5)).toBe('2026-10-05');
  });

  it('gets first and last day of a period', () => {
    expect(firstDayOf(p('2026-10'))).toBe('2026-10-01');
    expect(lastDayOf(p('2026-02'))).toBe('2026-02-28');
    expect(periodOf(d('2026-10-23'))).toBe('2026-10');
  });

  it('adds and counts days', () => {
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
    expect(daysBetween(d('2026-10-23'), d('2026-10-30'))).toBe(7);
  });

  it('computes "today" in Buenos Aires from an instant (no system clock)', () => {
    // 02:30 UTC on Oct 24 is still Oct 23 in Buenos Aires (UTC−3).
    expect(localDateAt(new Date('2026-10-24T02:30:00Z'))).toBe('2026-10-23');
    expect(localDateAt(new Date('2026-10-24T03:30:00Z'))).toBe('2026-10-24');
  });

  it('round-trips @db.Date values', () => {
    expect(utcToLocalDate(localDateToUtc(d('2026-10-23')))).toBe('2026-10-23');
  });
});

describe('startOfDayIn', () => {
  it('midnight in Buenos Aires is 03:00 UTC', () => {
    expect(startOfDayIn(d('2026-11-27')).toISOString()).toBe('2026-11-27T03:00:00.000Z');
    expect(startOfDayIn(d('2026-11-27'), 'UTC').toISOString()).toBe('2026-11-27T00:00:00.000Z');
  });
});
