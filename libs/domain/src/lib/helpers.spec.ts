import {
  maxDate,
  minDate,
  parseLocalDate,
  parsePeriod,
  periodToUtc,
  utcToPeriod,
  compareDates,
  daysInPeriod,
  dateParts,
} from './dates';
import { isStatementClosed } from './enums';
import { Money, round6, toDecimal } from './money';
import { ars, d, p } from './test-helpers';

describe('date helpers', () => {
  it('throws on malformed input', () => {
    expect(() => parseLocalDate('23/10/2026')).toThrow(/YYYY-MM-DD/);
    expect(() => parsePeriod('2026-10-01')).toThrow(/YYYY-MM/);
  });

  it('compares, picks min and max', () => {
    expect(compareDates(d('2026-10-01'), d('2026-10-02'))).toBe(-1);
    expect(compareDates(p('2026-10'), p('2026-10'))).toBe(0);
    expect(maxDate(p('2026-10'), p('2026-11'))).toBe('2026-11');
    expect(minDate(d('2026-10-01'), d('2026-09-30'))).toBe('2026-09-30');
  });

  it('converts periods to and from @db.Date values', () => {
    expect(periodToUtc(p('2026-10')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(utcToPeriod(new Date('2026-10-01T00:00:00.000Z'))).toBe('2026-10');
  });

  it('exposes parts and month length', () => {
    expect(dateParts(d('2026-10-23'))).toEqual({ year: 2026, month: 10, day: 23 });
    expect(daysInPeriod(p('2026-02'))).toBe(28);
  });
});

describe('Money helpers', () => {
  it('compares amounts', () => {
    expect(ars('10').greaterThan(ars('9.99'))).toBe(true);
    expect(ars('10').lessThan(ars('9.99'))).toBe(false);
    expect(ars('10').max(ars('20')).toString()).toBe('20.00');
    expect(ars('10').min(ars('20')).toString()).toBe('10.00');
    expect(ars('10').equals(Money.of('10.00', 'ARS'))).toBe(true);
    expect(ars('10').equals(Money.of('10', 'USD'))).toBe(false);
  });

  it('knows its sign', () => {
    expect(ars('-5').abs().toString()).toBe('5.00');
    expect(ars('5').negate().isNegative()).toBe(true);
    expect(ars('0').isPositive()).toBe(false);
    expect(ars('0').isNegative()).toBe(false);
    expect(Money.zero('USD').isZero()).toBe(true);
  });

  it('multiplies by a factor', () => {
    expect(ars('45833.33').times(8).toString()).toBe('366666.64');
    expect(ars('100').times('0.105').toString()).toBe('10.50');
  });

  it('serializes amounts as decimal strings', () => {
    expect(JSON.parse(JSON.stringify({ total: ars('18500') }))).toEqual({
      total: { amount: '18500.00', currency: 'ARS' },
    });
  });

  it('rounds rates to 6 decimals', () => {
    expect(round6(toDecimal('1250.1234565')).toFixed(6)).toBe('1250.123457');
  });

  it('rejects splitting into zero parts', () => {
    expect(() => ars('10').split(0)).toThrow();
  });
});

describe('isStatementClosed', () => {
  it('only OPEN statements accept changes', () => {
    expect(isStatementClosed('OPEN')).toBe(false);
    expect(isStatementClosed('CLOSED')).toBe(true);
    expect(isStatementClosed('PARTIALLY_PAID')).toBe(true);
    expect(isStatementClosed('PAID')).toBe(true);
  });
});
