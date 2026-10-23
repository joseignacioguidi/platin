import { impliedRate, toBase, totalsByCurrency, valueIn } from './exchange';
import { ars, usd } from './test-helpers';

describe('exchange', () => {
  it('freezes rate and base amount for a USD movement with ARS base', () => {
    const result = toBase(usd('24.99'), 'ARS', '1250.50');
    expect(result.rateToBase).toBe('1250.500000');
    // 24.99 × 1250.50 = 31249.995 → half up
    expect(result.baseAmount.toString()).toBe('31250.00');
    expect(result.baseAmount.currency).toBe('ARS');
  });

  it('uses rate 1 for the base currency', () => {
    const result = toBase(ars('18500'), 'ARS', '1250');
    expect(result.rateToBase).toBe('1.000000');
    expect(result.baseAmount.toString()).toBe('18500.00');
  });

  it('converts ARS to a USD base with the exact factor', () => {
    const result = toBase(ars('100000'), 'USD', '1185.5');
    expect(result.rateToBase).toBe('0.000844');
    // Exact: 100000 / 1185.5 = 84.3526...
    expect(result.baseAmount.toString()).toBe('84.35');
  });

  it('rejects non-positive rates', () => {
    expect(() => toBase(usd('1'), 'ARS', '0')).toThrow();
  });

  it('computes the implied rate of buying and selling dollars', () => {
    expect(impliedRate(ars('1250000'), usd('1000'))).toBe('1250.000000');
    expect(impliedRate(usd('1000'), ars('1240000'))).toBe('1240.000000');
    expect(impliedRate(ars('10'), ars('10'))).toBeUndefined();
  });

  it('values and totals by currency', () => {
    expect(valueIn(usd('10'), 'ARS', '1200').toString()).toBe('12000.00');
    const totals = totalsByCurrency([ars('1000'), usd('10'), ars('500')], 'ARS', '1200');
    expect(totals.ARS.toString()).toBe('1500.00');
    expect(totals.USD.toString()).toBe('10.00');
    expect(totals.base.toString()).toBe('13500.00');
  });
});
