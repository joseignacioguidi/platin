import { formatMoney, Money, toDecimal } from './money';
import { ars, usd } from './test-helpers';

describe('Money', () => {
  it('rounds to 2 decimals half up', () => {
    expect(ars('10.005').toString()).toBe('10.01');
    expect(ars('10.004').toString()).toBe('10.00');
    expect(ars('-10.005').toString()).toBe('-10.01');
  });

  it('does not suffer float errors', () => {
    expect(ars('0.1').add(ars('0.2')).toString()).toBe('0.30');
  });

  it('adds and subtracts in the same currency only', () => {
    expect(ars('100').subtract(ars('30.5')).toString()).toBe('69.50');
    expect(() => ars('1').add(usd('1'))).toThrow(/Currency mismatch/);
  });

  it('rejects numbers and malformed strings', () => {
    expect(() => toDecimal('1,5')).toThrow();
    expect(() => toDecimal('abc')).toThrow();
  });

  it('converts with a rate', () => {
    expect(usd('100').convert('1250.5', 'ARS').toString()).toBe('125050.00');
  });

  it('splits with the difference in the last part', () => {
    expect(ars('100000').split(3).map(String)).toEqual(['33333.33', '33333.33', '33333.34']);
    expect(ars('100').split(1).map(String)).toEqual(['100.00']);
    const parts = ars('550000').split(12);
    expect(Money.sum(parts, 'ARS').toString()).toBe('550000.00');
  });

  it('is immutable', () => {
    const a = ars('10');
    a.add(ars('5'));
    expect(a.toString()).toBe('10.00');
  });

  it('formats in es-AR', () => {
    expect(formatMoney(ars('18500'))).toBe('$ 18.500,00');
    expect(formatMoney(usd('771.43'))).toBe('USD 771,43');
    expect(formatMoney(ars('1850000'), { decimals: false })).toBe('$ 1.850.000');
    expect(formatMoney(ars('412300'), { decimals: 'auto' })).toBe('$ 412.300');
    expect(formatMoney(usd('24.99'), { decimals: 'auto' })).toBe('USD 24,99');
    expect(formatMoney(ars('-500'))).toBe('−$ 500,00');
    expect(formatMoney(ars('500'), { signDisplay: 'always' })).toBe('+$ 500,00');
  });
});
