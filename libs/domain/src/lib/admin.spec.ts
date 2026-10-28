import { countByWeek, isAnnouncementActive, weekStart } from './admin';
import { d } from './test-helpers';

describe('admin', () => {
  it('shows an announcement with text inside its dates, both inclusive', () => {
    const notice = {
      text: 'Mantenimiento el sábado',
      startsOn: d('2026-11-01'),
      endsOn: d('2026-11-07'),
    };
    expect(isAnnouncementActive(notice, d('2026-10-31'))).toBe(false);
    expect(isAnnouncementActive(notice, d('2026-11-01'))).toBe(true);
    expect(isAnnouncementActive(notice, d('2026-11-07'))).toBe(true);
    expect(isAnnouncementActive(notice, d('2026-11-08'))).toBe(false);
  });

  it('an announcement without dates is always on, and without text never', () => {
    expect(
      isAnnouncementActive({ text: 'Hola', startsOn: null, endsOn: null }, d('2030-01-01')),
    ).toBe(true);
    expect(
      isAnnouncementActive({ text: '  ', startsOn: null, endsOn: null }, d('2030-01-01')),
    ).toBe(false);
  });

  it('weeks start on Monday', () => {
    expect(weekStart(d('2026-10-28'))).toBe('2026-10-26'); // Wednesday
    expect(weekStart(d('2026-10-26'))).toBe('2026-10-26'); // Monday
    expect(weekStart(d('2026-11-01'))).toBe('2026-10-26'); // Sunday
    expect(weekStart(d('2027-01-01'))).toBe('2026-12-28'); // across years
  });

  it('counts sign-ups per week, oldest first, ignoring older dates', () => {
    const weeks = countByWeek(
      [d('2026-10-28'), d('2026-10-26'), d('2026-10-25'), d('2026-10-12'), d('2026-01-01')],
      d('2026-10-28'),
      3,
    );
    expect(weeks).toEqual([
      { weekStart: '2026-10-12', count: 1 },
      { weekStart: '2026-10-19', count: 1 },
      { weekStart: '2026-10-26', count: 2 },
    ]);
  });
});
