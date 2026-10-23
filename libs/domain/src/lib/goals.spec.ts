import { goalAccumulated, goalProjection, isGoalOverdue, progressPercent } from './goals';
import { ars, d, p, usd } from './test-helpers';

/** The car goal from the specification and the "Meta de ahorro" mockup. */
const car = { targetAmount: usd('15000'), targetPeriod: p('2027-12'), startPeriod: p('2026-01') };

describe('goalProjection', () => {
  const projection = goalProjection(car, usd('4200'), d('2026-10-23'));

  it('USD 15.000 for December 2027 with USD 4.200 in October 2026 → USD 771,43 per month', () => {
    expect(projection.remaining.toString()).toBe('10800.00');
    expect(projection.monthsLeft).toBe(14);
    expect(projection.monthlyNeeded.toString()).toBe('771.43');
    expect(projection.monthlyNeeded.currency).toBe('USD');
  });

  it('shows 28 % progress', () => {
    expect(projection.progress).toBe('0.2800');
    expect(progressPercent(projection.progress)).toBe(28);
  });

  it('pace: the plan expected USD 5.625 by now, so it is USD 1.425 behind', () => {
    expect(projection.expectedToDate.toString()).toBe('5625.00');
    expect(projection.pace).toBe('BEHIND');
    expect(projection.paceDifference.toString()).toBe('1425.00');
  });

  it('is ahead when the accumulated beats the expected', () => {
    const ahead = goalProjection(car, usd('6000'), d('2026-10-01'));
    expect(ahead.pace).toBe('AHEAD');
    expect(ahead.paceDifference.toString()).toBe('375.00');
  });

  it('with USD 900 per month it is reached in October 2027, 2 months early', () => {
    const simulated = goalProjection(car, usd('4200'), d('2026-10-23'), usd('900'));
    expect(simulated.simulation).toEqual(
      expect.objectContaining({ monthsNeeded: 12, reachedIn: '2027-10', monthsBeforeTarget: 2 }),
    );
  });

  it('rounds the months needed up', () => {
    const simulated = goalProjection(car, usd('4200'), d('2026-10-23'), usd('500'));
    // 10800 / 500 = 21.6 → 22 months → August 2028, 8 months late
    expect(simulated.simulation?.monthsNeeded).toBe(22);
    expect(simulated.simulation?.reachedIn).toBe('2028-08');
    expect(simulated.simulation?.monthsBeforeTarget).toBe(-8);
  });

  it('needs at least 1 month when the target month is the current one or already passed', () => {
    expect(goalProjection(car, usd('4200'), d('2027-12-10')).monthsLeft).toBe(1);
    expect(goalProjection(car, usd('4200'), d('2028-03-10')).monthlyNeeded.toString()).toBe(
      '10800.00',
    );
    expect(isGoalOverdue(car, d('2028-01-01'))).toBe(true);
    expect(isGoalOverdue(car, d('2027-12-31'))).toBe(false);
  });

  it('a reached goal has nothing remaining and caps progress at 100 %', () => {
    const done = goalProjection(car, usd('16000'), d('2026-10-23'), usd('900'));
    expect(done.remaining.toString()).toBe('0.00');
    expect(done.progress).toBe('1.0000');
    expect(done.monthlyNeeded.toString()).toBe('0.00');
    expect(done.simulation?.monthsNeeded).toBe(0);
  });

  it('a goal created this month expects nothing yet', () => {
    const fresh = goalProjection({ ...car, startPeriod: p('2026-10') }, usd('0'), d('2026-10-23'));
    expect(fresh.expectedToDate.toString()).toBe('0.00');
    expect(fresh.pace).toBe('ON_TRACK');
  });

  it('rejects mixed currencies and invalid contributions', () => {
    expect(() => goalProjection(car, ars('4200'), d('2026-10-23'))).toThrow();
    expect(() => goalProjection(car, usd('4200'), d('2026-10-23'), usd('0'))).toThrow();
  });
});

describe('goalAccumulated', () => {
  it('sums linked account balances converted to the goal currency', () => {
    const total = goalAccumulated(
      'USD',
      [{ balance: usd('3000') }, { balance: usd('1200') }],
      [],
      '1200',
    );
    expect(total.toString()).toBe('4200.00');
    const mixed = goalAccumulated(
      'USD',
      [{ balance: usd('3000') }, { balance: ars('1440000') }],
      [],
      '1200',
    );
    expect(mixed.toString()).toBe('4200.00');
  });

  it('uses assigned contributions when there are no linked accounts', () => {
    expect(
      goalAccumulated('USD', [], [usd('500'), usd('700'), usd('-200')], '1200').toString(),
    ).toBe('1000.00');
  });
});
