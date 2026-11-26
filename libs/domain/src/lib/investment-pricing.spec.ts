import {
  autoValuationsDue,
  firstNegativeHolding,
  holdingUnits,
  marketValue,
  termDepositMatured,
  termDepositPosition,
  termDepositValue,
  TermDepositTerms,
  unitsForAmount,
} from './investment-pricing';
import { yieldFromValuation } from './investments';
import { ars, d, usd } from './test-helpers';

describe('marketValue and unitsForAmount (rule "Inversiones con precio automático")', () => {
  it('FCI example: 150 units of Super Ahorro $ at 20.615,519 are worth 3.092.327,85', () => {
    expect(marketValue('150', '20615.519', 'ARS').toString()).toBe('3092327.85');
  });

  it('FCI example: investing 500.000 at that price proposes 24,25357324 units, worth 500.000,00', () => {
    const units = unitsForAmount(ars('500000'), '20615.519');
    expect(units.toFixed(8)).toBe('24.25357324');
    expect(marketValue(units, '20615.519', 'ARS').toString()).toBe('500000.00');
  });

  it('CEDEAR example: 20 AAPL at 13.000 are worth 260.000; invested 240.000 → yield 20.000', () => {
    const value = marketValue('20', '13000', 'ARS');
    expect(value.toString()).toBe('260000.00');
    const live = yieldFromValuation(ars('240000'), value);
    expect(live.toString()).toBe('20000.00');
    expect(live.amount.dividedBy('240000').toFixed(4)).toBe('0.0833');
  });

  it('rounds the value half up and the units to 8 decimals', () => {
    expect(marketValue('0.0015', '97123.455', 'USD').toString()).toBe('145.69');
    expect(unitsForAmount(usd('100'), '3').toFixed(8)).toBe('33.33333333');
    expect(unitsForAmount(usd('200'), '3').toFixed(8)).toBe('66.66666667');
  });

  it('a price that is not positive is an error', () => {
    expect(() => unitsForAmount(ars('100'), '0')).toThrow();
  });
});

describe('holdingUnits', () => {
  const changes = [
    { date: d('2026-11-02'), direction: 'IN' as const, units: '24.25357324' },
    { date: d('2026-11-10'), direction: 'OUT' as const, units: '10' },
    { date: d('2026-11-20'), direction: 'IN' as const, units: '0.5' },
  ];

  it('initial units plus what came in, minus what went out, with corrections', () => {
    expect(holdingUnits('150', changes).toFixed(8)).toBe('164.75357324');
  });

  it('at a date it ignores later changes', () => {
    expect(holdingUnits('150', changes, d('2026-11-10')).toFixed(8)).toBe('164.25357324');
    expect(holdingUnits('150', changes, d('2026-11-01')).toFixed(8)).toBe('150.00000000');
  });

  it('a full redemption leaves zero, never negative', () => {
    const all = [...changes, { date: d('2026-11-25'), direction: 'OUT' as const, units: '164.75357324' }];
    expect(holdingUnits('150', all).isZero()).toBe(true);
    expect(firstNegativeHolding('150', all)).toBeNull();
  });

  it('a correction that subtracts more than there is would leave it negative', () => {
    const wrong = [...changes, { date: d('2026-11-25'), direction: 'OUT' as const, units: '200' }];
    expect(firstNegativeHolding('150', wrong)).toBe('2026-11-25');
  });

  it('negative in between counts even if it ends positive; same-day buys count first', () => {
    const between = [
      { date: d('2026-11-05'), direction: 'OUT' as const, units: '160' },
      { date: d('2026-11-06'), direction: 'IN' as const, units: '50' },
    ];
    expect(firstNegativeHolding('150', between)).toBe('2026-11-05');
    const sameDay = [
      { date: d('2026-11-05'), direction: 'OUT' as const, units: '160' },
      { date: d('2026-11-05'), direction: 'IN' as const, units: '50' },
    ];
    expect(firstNegativeHolding('150', sameDay)).toBeNull();
  });
});

describe('term deposit (INV-12)', () => {
  // Example: 1.000.000 at 30 % TNA, from 01/11/2026 for 30 days.
  const terms: TermDepositTerms = {
    principal: ars('1000000'),
    tna: '0.30',
    startDate: d('2026-11-01'),
    endDate: d('2026-12-01'),
  };

  it('on 16/11 it is worth 1.012.328,77', () => {
    expect(termDepositValue(terms, d('2026-11-16')).toString()).toBe('1012328.77');
  });

  it('at maturity, 01/12, it is worth 1.024.657,53 and stays there', () => {
    expect(termDepositValue(terms, d('2026-12-01')).toString()).toBe('1024657.53');
    expect(termDepositValue(terms, d('2027-01-15')).toString()).toBe('1024657.53');
    expect(termDepositMatured(terms, d('2026-11-30'))).toBe(false);
    expect(termDepositMatured(terms, d('2026-12-01'))).toBe(true);
  });

  it('on the start date and before it is the principal', () => {
    expect(termDepositValue(terms, d('2026-11-01')).toString()).toBe('1000000.00');
    expect(termDepositValue(terms, d('2026-10-20')).toString()).toBe('1000000.00');
  });

  it('the position: matured until it is redeemed, then zero', () => {
    const open = termDepositPosition(terms, ars('0'), d('2026-12-05'));
    expect(open).toMatchObject({ matured: true, redeemed: false });
    expect(open.value.toString()).toBe('1024657.53');

    const done = termDepositPosition(terms, ars('1024657.53'), d('2026-12-05'));
    expect(done).toMatchObject({ matured: false, redeemed: true });
    expect(done.value.isZero()).toBe(true);

    // Redeeming only the principal leaves the interest.
    const part = termDepositPosition(terms, ars('1000000'), d('2026-12-05'));
    expect(part.value.toString()).toBe('24657.53');
    expect(part.redeemed).toBe(false);
  });

  it('redeemed at maturity, the month-end valuation records the interest as yield', () => {
    // Balance after investing 1.000.000 and redeeming 1.024.657,53: −24.657,53.
    const position = termDepositPosition(terms, ars('1024657.53'), d('2026-12-31'));
    expect(yieldFromValuation(ars('-24657.53'), position.value).toString()).toBe('24657.53');
  });
});

describe('autoValuationsDue (INV-11)', () => {
  const today = d('2026-12-01');

  it('dated the last day of the previous month', () => {
    expect(
      autoValuationsDue([{ pocketId: 'a', since: d('2026-11-01'), lastValuation: null }], today),
    ).toEqual([{ pocketId: 'a', date: '2026-11-30' }]);
  });

  it('nothing when there is a valuation on that date or later (a second sync)', () => {
    expect(
      autoValuationsDue(
        [
          { pocketId: 'a', since: d('2026-11-01'), lastValuation: d('2026-11-30') },
          { pocketId: 'b', since: d('2026-11-01'), lastValuation: d('2026-12-01') },
          { pocketId: 'c', since: d('2026-10-01'), lastValuation: d('2026-10-31') },
        ],
        today,
      ),
    ).toEqual([{ pocketId: 'c', date: '2026-11-30' }]);
  });

  it('nothing for an investment that had no automatic value yet on that date', () => {
    expect(
      autoValuationsDue([{ pocketId: 'a', since: d('2026-12-01'), lastValuation: null }], today),
    ).toEqual([]);
    expect(
      autoValuationsDue([{ pocketId: 'a', since: d('2026-11-30'), lastValuation: null }], today),
    ).toEqual([{ pocketId: 'a', date: '2026-11-30' }]);
  });

  it('in January it values the 31st of December', () => {
    expect(
      autoValuationsDue(
        [{ pocketId: 'a', since: d('2026-11-01'), lastValuation: null }],
        d('2027-01-14'),
      ),
    ).toEqual([{ pocketId: 'a', date: '2026-12-31' }]);
  });
});
