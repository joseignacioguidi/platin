import { accountTotals, balanceAdjustment, pocketBalance, transactionEffect } from './balance';
import { ars, d, usd } from './test-helpers';

describe('pocketBalance', () => {
  it('adds confirmed income, subtracts confirmed expenses and applies adjustments and transfers', () => {
    const balance = pocketBalance(
      ars('100000'),
      [
        { type: 'INCOME', status: 'CONFIRMED', amount: '1850000' },
        { type: 'EXPENSE', status: 'CONFIRMED', amount: '18500' },
        { type: 'ADJUSTMENT', status: 'CONFIRMED', amount: '-1500' },
        { type: 'ADJUSTMENT', status: 'CONFIRMED', amount: '200' },
      ],
      [
        { direction: 'OUT', amount: '1250000' },
        { direction: 'IN', amount: '30000' },
      ],
    );
    expect(balance.toString()).toBe('710200.00');
  });

  it('a negative adjustment lowers the balance', () => {
    const balance = pocketBalance(
      ars('50000'),
      [{ type: 'ADJUSTMENT', status: 'CONFIRMED', amount: '-7250.50' }],
      [],
    );
    expect(balance.toString()).toBe('42749.50');
  });

  it('yields carry their sign: a gain adds and a loss subtracts', () => {
    const balance = pocketBalance(
      ars('0'),
      [
        { type: 'YIELD', status: 'CONFIRMED', amount: '40000' },
        { type: 'YIELD', status: 'CONFIRMED', amount: '-15000' },
      ],
      [{ direction: 'IN', amount: '500000' }],
    );
    expect(balance.toString()).toBe('525000.00');
  });

  it('ignores pending movements until they are confirmed', () => {
    const balance = pocketBalance(
      ars('0'),
      [{ type: 'EXPENSE', status: 'PENDING', amount: '380000' }],
      [],
    );
    expect(balance.toString()).toBe('0.00');
  });

  it('a dollar purchase inside the same account moves both pockets', () => {
    // Mercado Pago: Disponible (ARS) → Ahorro en dólares (USD) at 1250.
    const pesos = pocketBalance(ars('2000000'), [], [{ direction: 'OUT', amount: '1250000' }]);
    const dollars = pocketBalance(usd('0'), [], [{ direction: 'IN', amount: '1000' }]);
    expect(pesos.toString()).toBe('750000.00');
    expect(dollars.toString()).toBe('1000.00');
    expect(dollars.currency).toBe('USD');
  });

  it('cuts the balance at a date (included)', () => {
    const transactions = [
      {
        type: 'INCOME' as const,
        status: 'CONFIRMED' as const,
        amount: '1000',
        date: d('2026-10-01'),
      },
      {
        type: 'EXPENSE' as const,
        status: 'CONFIRMED' as const,
        amount: '300',
        date: d('2026-10-15'),
      },
      {
        type: 'EXPENSE' as const,
        status: 'CONFIRMED' as const,
        amount: '200',
        date: d('2026-10-20'),
      },
    ];
    const transfers = [{ direction: 'IN' as const, amount: '50', date: d('2026-10-16') }];
    expect(pocketBalance(ars('0'), transactions, transfers, d('2026-10-15')).toString()).toBe(
      '700.00',
    );
    expect(pocketBalance(ars('0'), transactions, transfers).toString()).toBe('550.00');
  });
});

describe('accountTotals', () => {
  it('adds the pockets of an account separately by currency', () => {
    const totals = accountTotals([
      { balance: ars('120000') }, // Disponible
      { balance: ars('300000') }, // Ahorro en pesos
      { balance: usd('1500') }, // Ahorro en dólares
      { balance: ars('500000') }, // Inversión largo plazo
    ]);
    expect(totals.ARS.toString()).toBe('920000.00');
    expect(totals.USD.toString()).toBe('1500.00');
  });

  it('leaves archived pockets out', () => {
    const totals = accountTotals([
      { balance: ars('1000') },
      { balance: usd('0'), archived: true },
      { balance: ars('5'), archived: true },
    ]);
    expect(totals.ARS.toString()).toBe('1000.00');
    expect(totals.USD.isZero()).toBe(true);
  });
});

describe('balanceAdjustment', () => {
  it('returns the signed difference to the real balance', () => {
    expect(balanceAdjustment(ars('1000'), ars('850'))?.toString()).toBe('-150.00');
    expect(balanceAdjustment(ars('1000'), ars('1200'))?.toString()).toBe('200.00');
    expect(balanceAdjustment(ars('1000'), ars('1000'))).toBeUndefined();
  });
});

describe('transactionEffect', () => {
  it('signs by type and ignores pending', () => {
    const effect = (type: 'INCOME' | 'EXPENSE', status: 'PENDING' | 'CONFIRMED') =>
      transactionEffect({ type, status, amount: '10' }, 'ARS').toString();
    expect(effect('EXPENSE', 'CONFIRMED')).toBe('-10.00');
    expect(effect('INCOME', 'CONFIRMED')).toBe('10.00');
    expect(effect('INCOME', 'PENDING')).toBe('0.00');
  });
});
