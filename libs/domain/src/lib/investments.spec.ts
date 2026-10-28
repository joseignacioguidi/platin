import { pocketBalance } from './balance';
import {
  investmentSummary,
  oneMonthAfter,
  valuationOverdue,
  yieldFromValuation,
} from './investments';
import { ars, d, usd } from './test-helpers';

describe('yieldFromValuation', () => {
  it('is the value minus the balance at that date, with its sign', () => {
    expect(yieldFromValuation(ars('500000'), ars('540000')).toString()).toBe('40000.00');
    expect(yieldFromValuation(ars('500000'), ars('470000')).toString()).toBe('-30000.00');
    expect(yieldFromValuation(ars('500000'), ars('500000')).isZero()).toBe(true);
  });
});

describe('investmentSummary', () => {
  it('phase 11 example: invested 500.000, valued 540.000 → yield 40.000 (8 %)', () => {
    const transfers = [{ direction: 'IN' as const, amount: '500000' }];
    const yields = [{ amount: yieldFromValuation(ars('500000'), ars('540000')).toString() }];
    const balance = pocketBalance(
      ars('0'),
      [{ type: 'YIELD', status: 'CONFIRMED', amount: yields[0].amount }],
      transfers,
    );
    expect(balance.toString()).toBe('540000.00');
    const summary = investmentSummary({ initialBalance: ars('0'), balance }, transfers, yields);
    expect(summary.investedNet.toString()).toBe('500000.00');
    expect(summary.currentValue.toString()).toBe('540000.00');
    expect(summary.accumulatedYield.toString()).toBe('40000.00');
    expect(summary.yieldRate).toBe('0.0800');
    expect(summary.lastYield.toString()).toBe('40000.00');
  });

  it('a negative yield', () => {
    const summary = investmentSummary(
      { initialBalance: usd('0'), balance: usd('900') },
      [{ direction: 'IN', amount: '1000' }],
      [{ amount: '-100' }],
    );
    expect(summary.accumulatedYield.toString()).toBe('-100.00');
    expect(summary.yieldRate).toBe('-0.1000');
  });

  it('a partial redemption lowers the invested net; the last period is the last valuation', () => {
    const summary = investmentSummary(
      { initialBalance: ars('100000'), balance: ars('520000') },
      [
        { direction: 'IN', amount: '500000' },
        { direction: 'OUT', amount: '120000' },
      ],
      [{ amount: '25000' }, { amount: '15000' }],
    );
    expect(summary.investedNet.toString()).toBe('480000.00');
    expect(summary.accumulatedYield.toString()).toBe('40000.00');
    expect(summary.yieldRate).toBe('0.0833');
    expect(summary.lastYield.toString()).toBe('15000.00');
  });

  it('without money invested there is no rate', () => {
    const summary = investmentSummary({ initialBalance: ars('0'), balance: ars('0') }, [], []);
    expect(summary.yieldRate).toBeNull();
    expect(summary.lastYield.isZero()).toBe(true);
  });
});

describe('valuationOverdue', () => {
  it('suggests updating only after more than a month', () => {
    expect(valuationOverdue(d('2026-09-27'), d('2026-10-27'))).toBe(false);
    expect(valuationOverdue(d('2026-09-27'), d('2026-10-28'))).toBe(true);
  });

  it('clamps to the length of the next month', () => {
    expect(oneMonthAfter(d('2026-01-31'))).toBe('2026-02-28');
    expect(oneMonthAfter(d('2028-01-31'))).toBe('2028-02-29');
  });
});
