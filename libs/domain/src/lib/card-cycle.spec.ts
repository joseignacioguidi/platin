import {
  buildStatementDates,
  previousStatementWindow,
  StatementDates,
  statementPeriodFor,
  statementPurchaseRange,
} from './card-cycle';
import { Period } from './dates';
import { d, p } from './test-helpers';

const visa = { closingDay: 30, dueDay: 5 };

describe('buildStatementDates', () => {
  it('closes on the closing day and is due on the next due day', () => {
    expect(buildStatementDates(visa, p('2026-10'))).toEqual({
      closingDate: '2026-10-30',
      dueDate: '2026-11-05',
    });
  });

  it('uses the last day when the month is shorter (closing day 31 in February)', () => {
    const card = { closingDay: 31, dueDay: 10 };
    expect(buildStatementDates(card, p('2026-02'))).toEqual({
      closingDate: '2026-02-28',
      dueDate: '2026-03-10',
    });
    expect(buildStatementDates(card, p('2028-02')).closingDate).toBe('2028-02-29');
  });

  it('is due in the same month when the due day comes after the closing day', () => {
    expect(buildStatementDates({ closingDay: 5, dueDay: 18 }, p('2026-10'))).toEqual({
      closingDate: '2026-10-05',
      dueDate: '2026-10-18',
    });
  });

  it('is due next month when the due day equals the closing day', () => {
    expect(buildStatementDates({ closingDay: 10, dueDay: 10 }, p('2026-12')).dueDate).toBe(
      '2027-01-10',
    );
  });

  it('clamps the due day in short months', () => {
    expect(buildStatementDates({ closingDay: 25, dueDay: 31 }, p('2026-02')).dueDate).toBe(
      '2026-02-28',
    );
    expect(buildStatementDates({ closingDay: 28, dueDay: 30 }, p('2026-01')).dueDate).toBe(
      '2026-01-30',
    );
  });

  it('rejects invalid days', () => {
    expect(() => buildStatementDates({ closingDay: 0, dueDay: 5 }, p('2026-10'))).toThrow();
    expect(() => buildStatementDates({ closingDay: 32, dueDay: 5 }, p('2026-10'))).toThrow();
  });
});

describe('statementPeriodFor', () => {
  it('a purchase on the closing day falls in that statement', () => {
    expect(statementPeriodFor(visa, d('2026-10-30'))).toBe('2026-10');
  });

  it('a purchase the day after the closing falls in the next statement', () => {
    expect(statementPeriodFor(visa, d('2026-10-31'))).toBe('2026-11');
  });

  it('a purchase before the closing falls in that month', () => {
    expect(statementPeriodFor(visa, d('2026-10-01'))).toBe('2026-10');
  });

  it('handles closing day 31 in February', () => {
    const card = { closingDay: 31, dueDay: 10 };
    expect(statementPeriodFor(card, d('2026-02-28'))).toBe('2026-02');
    expect(statementPeriodFor(card, d('2026-03-01'))).toBe('2026-03');
  });

  it('wraps to January after a December closing', () => {
    expect(statementPeriodFor({ closingDay: 20, dueDay: 2 }, d('2026-12-21'))).toBe('2027-01');
  });

  it('respects a manual correction of the closing date (TAR-06)', () => {
    const later = new Map<Period, StatementDates>([
      [p('2026-10'), { closingDate: d('2026-11-02'), dueDate: d('2026-11-09') }],
    ]);
    expect(statementPeriodFor(visa, d('2026-11-01'), later)).toBe('2026-10');
    expect(statementPeriodFor(visa, d('2026-11-03'), later)).toBe('2026-11');

    const earlier = new Map<Period, StatementDates>([
      [p('2026-10'), { closingDate: d('2026-10-28'), dueDate: d('2026-11-05') }],
    ]);
    expect(statementPeriodFor(visa, d('2026-10-29'), earlier)).toBe('2026-11');
  });
});

describe('previousStatementWindow', () => {
  const card = { closingDay: 26, dueDay: 5 };

  it('returns the closed statement that is not yet due (spec example)', () => {
    expect(previousStatementWindow(card, d('2026-11-02'))).toEqual({
      period: '2026-10',
      closingDate: '2026-10-26',
      dueDate: '2026-11-05',
    });
  });

  it('is none on the closing day and open from the day after', () => {
    expect(previousStatementWindow(card, d('2026-10-26'))).toBeNull();
    expect(previousStatementWindow(card, d('2026-10-27'))?.period).toBe('2026-10');
  });

  it('includes the due day and excludes the day after', () => {
    expect(previousStatementWindow(card, d('2026-11-05'))?.period).toBe('2026-10');
    expect(previousStatementWindow(card, d('2026-11-06'))).toBeNull();
  });

  it('handles a short month', () => {
    expect(previousStatementWindow({ closingDay: 31, dueDay: 10 }, d('2026-03-05'))).toEqual({
      period: '2026-02',
      closingDate: '2026-02-28',
      dueDate: '2026-03-10',
    });
  });

  it('respects corrected dates', () => {
    const overrides = new Map<Period, StatementDates>([
      [p('2026-10'), { closingDate: d('2026-10-28'), dueDate: d('2026-11-09') }],
    ]);
    expect(previousStatementWindow(card, d('2026-11-07'))).toBeNull();
    expect(previousStatementWindow(card, d('2026-11-07'), overrides)?.dueDate).toBe('2026-11-09');
    expect(previousStatementWindow(card, d('2026-10-27'), overrides)).toBeNull();
  });
});

describe('statementPurchaseRange', () => {
  const card = { closingDay: 15, dueDay: 5 };

  it('goes from the day after the previous closing to its own closing', () => {
    expect(statementPurchaseRange(card, p('2026-10'))).toEqual({
      from: '2026-09-16',
      to: '2026-10-15',
    });
  });

  it('respects corrected dates of either statement', () => {
    const overrides = new Map<Period, StatementDates>([
      [p('2026-09'), { closingDate: d('2026-09-18'), dueDate: d('2026-10-05') }],
    ]);
    expect(statementPurchaseRange(card, p('2026-10'), overrides).from).toBe('2026-09-19');
  });
});
