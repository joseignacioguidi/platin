import { commitmentsByMonth, CommitmentsInput, freeThisMonth } from './commitments';
import { ars, d, p, usd } from './test-helpers';

const input: CommitmentsInput = {
  base: 'ARS',
  rates: '1200',
  installments: [
    {
      chargeId: 'c1',
      cardId: 'visa',
      description: 'Heladera',
      number: 5,
      count: 12,
      amount: ars('45833.33'),
      dueDate: d('2026-11-05'),
    },
    {
      chargeId: 'c1',
      cardId: 'visa',
      description: 'Heladera',
      number: 6,
      count: 12,
      amount: ars('45833.33'),
      dueDate: d('2026-12-05'),
    },
    {
      chargeId: 'c2',
      cardId: 'visa',
      description: 'Spotify',
      number: 1,
      count: 1,
      amount: usd('24.99'),
      dueDate: d('2026-11-05'),
    },
  ],
  fixed: [
    {
      id: 'rent',
      name: 'Alquiler',
      kind: 'EXPENSE',
      currency: 'ARS',
      intervalMonths: 1,
      dayOfMonth: 10,
      startPeriod: p('2026-01'),
      amounts: [
        { effectiveFrom: p('2026-01'), amount: ars('380000') },
        { effectiveFrom: p('2026-12'), amount: ars('450000') },
      ],
    },
    {
      id: 'salary',
      name: 'Sueldo',
      kind: 'INCOME',
      currency: 'ARS',
      intervalMonths: 1,
      dayOfMonth: 1,
      startPeriod: p('2026-01'),
      amounts: [{ effectiveFrom: p('2026-01'), amount: ars('1850000') }],
    },
  ],
};

describe('commitmentsByMonth', () => {
  const months = commitmentsByMonth(input, p('2026-11'), 12);

  it('returns the requested months', () => {
    expect(months).toHaveLength(12);
    expect(months[0].period).toBe('2026-11');
    expect(months[11].period).toBe('2027-10');
  });

  it('adds installments due in the month and fixed expenses, by currency', () => {
    const nov = months[0];
    expect(nov.committed.byCurrency.find((m) => m.currency === 'ARS')?.toString()).toBe(
      '425833.33',
    );
    expect(nov.committed.byCurrency.find((m) => m.currency === 'USD')?.toString()).toBe('24.99');
    // 425833.33 + 24.99 × 1200
    expect(nov.committed.base.toString()).toBe('455821.33');
    expect(nov.items.map((i) => i.type)).toEqual(['INSTALLMENT', 'INSTALLMENT', 'FIXED']);
  });

  it('uses the fixed amount in force each month', () => {
    expect(months[1].committed.byCurrency.find((m) => m.currency === 'ARS')?.toString()).toBe(
      '495833.33',
    );
    expect(months[2].committed.byCurrency.find((m) => m.currency === 'ARS')?.toString()).toBe(
      '450000.00',
    );
  });

  it('computes free = expected income − committed', () => {
    expect(months[0].expectedIncome.base.toString()).toBe('1850000.00');
    expect(months[0].free.toString()).toBe('1394178.67');
  });

  it('rejects an invalid number of months', () => {
    expect(() => commitmentsByMonth(input, p('2026-11'), 0)).toThrow();
  });
});

describe('freeThisMonth', () => {
  it('matches the home mockup: 1.850.000 − 674.000 − 763.700 = 412.300', () => {
    expect(freeThisMonth(ars('1850000'), ars('674000'), ars('763700')).toString()).toBe(
      '412300.00',
    );
  });

  it('can be negative', () => {
    expect(freeThisMonth(ars('100'), ars('80'), ars('50')).toString()).toBe('-30.00');
  });
});
