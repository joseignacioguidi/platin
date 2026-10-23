import { duePeriods, FixedSchedule, fixedAmountFor, nextDuePeriod } from './fixed';
import { ars, p, usd } from './test-helpers';

const rent: FixedSchedule = {
  kind: 'EXPENSE',
  currency: 'ARS',
  intervalMonths: 1,
  dayOfMonth: 10,
  startPeriod: p('2026-07'),
  amounts: [{ effectiveFrom: p('2026-07'), amount: ars('380000') }],
};

const summary = (fixed: FixedSchedule, from: string, to: string) =>
  duePeriods(fixed, p(from), p(to)).map(
    (due) => `${due.period} ${due.date} ${due.amount.toString()}`,
  );

describe('duePeriods', () => {
  it('generates one per month with its date', () => {
    expect(summary(rent, '2026-09', '2026-11')).toEqual([
      '2026-09 2026-09-10 380000.00',
      '2026-10 2026-10-10 380000.00',
      '2026-11 2026-11-10 380000.00',
    ]);
  });

  it('does not generate before the start', () => {
    expect(summary(rent, '2026-05', '2026-07')).toEqual(['2026-07 2026-07-10 380000.00']);
  });

  it('a raise from a month keeps the old amount in previous months', () => {
    const raised: FixedSchedule = {
      ...rent,
      amounts: [...rent.amounts, { effectiveFrom: p('2026-10'), amount: ars('450000') }],
    };
    expect(summary(raised, '2026-08', '2026-11').map((s) => s.split(' ')[2])).toEqual([
      '380000.00',
      '380000.00',
      '450000.00',
      '450000.00',
    ]);
  });

  it('respects the end period', () => {
    expect(summary({ ...rent, endPeriod: p('2026-09') }, '2026-08', '2026-12')).toHaveLength(2);
  });

  it('a paused fixed item generates nothing from the pause on', () => {
    expect(
      summary({ ...rent, pausedFrom: p('2026-10') }, '2026-08', '2026-12').map((s) =>
        s.slice(0, 7),
      ),
    ).toEqual(['2026-08', '2026-09']);
  });

  it('yearly and every-N-months frequencies count from the start', () => {
    const yearly: FixedSchedule = {
      ...rent,
      intervalMonths: 12,
      startPeriod: p('2026-03'),
      amounts: [{ effectiveFrom: p('2026-03'), amount: usd('99') }],
      currency: 'USD',
    };
    expect(summary(yearly, '2026-01', '2028-12').map((s) => s.slice(0, 7))).toEqual([
      '2026-03',
      '2027-03',
      '2028-03',
    ]);
    const quarterly: FixedSchedule = { ...rent, intervalMonths: 3 };
    expect(summary(quarterly, '2026-07', '2027-01').map((s) => s.slice(0, 7))).toEqual([
      '2026-07',
      '2026-10',
      '2027-01',
    ]);
  });

  it('clamps day 31 to the end of the month', () => {
    expect(summary({ ...rent, dayOfMonth: 31 }, '2027-02', '2027-02')).toEqual([
      '2027-02 2027-02-28 380000.00',
    ]);
  });

  it('rejects an invalid interval', () => {
    expect(() => duePeriods({ ...rent, intervalMonths: 0 }, p('2026-07'), p('2026-08'))).toThrow();
  });
});

describe('fixedAmountFor', () => {
  it('picks the latest version in force', () => {
    const amounts = [
      { effectiveFrom: p('2026-10'), amount: ars('450000') },
      { effectiveFrom: p('2026-07'), amount: ars('380000') },
    ];
    expect(fixedAmountFor(amounts, p('2026-09'))?.toString()).toBe('380000.00');
    expect(fixedAmountFor(amounts, p('2026-10'))?.toString()).toBe('450000.00');
    expect(fixedAmountFor(amounts, p('2026-06'))).toBeUndefined();
  });
});

describe('nextDuePeriod', () => {
  it('finds the next occurrence', () => {
    expect(nextDuePeriod({ ...rent, intervalMonths: 12 }, p('2026-08'))?.period).toBe('2027-07');
    expect(nextDuePeriod({ ...rent, endPeriod: p('2026-07') }, p('2026-08'))).toBeUndefined();
  });
});
