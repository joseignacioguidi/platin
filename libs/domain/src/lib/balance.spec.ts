import { accountBalance, balanceAdjustment, transactionEffect } from './balance';
import { ars } from './test-helpers';

describe('accountBalance', () => {
  it('adds confirmed income, subtracts confirmed expenses and applies adjustments and transfers', () => {
    const balance = accountBalance({
      currency: 'ARS',
      initialBalance: '100000',
      transactions: [
        { type: 'INCOME', status: 'CONFIRMED', amount: '1850000' },
        { type: 'EXPENSE', status: 'CONFIRMED', amount: '18500' },
        { type: 'ADJUSTMENT', status: 'CONFIRMED', amount: '-1500' },
        { type: 'ADJUSTMENT', status: 'CONFIRMED', amount: '200' },
      ],
      transfersOut: [{ amount: '1250000' }],
      transfersIn: [{ amount: '30000' }],
    });
    expect(balance.toString()).toBe('710200.00');
  });

  it('ignores pending movements until they are confirmed', () => {
    const balance = accountBalance({
      currency: 'ARS',
      initialBalance: '0',
      transactions: [{ type: 'EXPENSE', status: 'PENDING', amount: '380000' }],
      transfersOut: [],
      transfersIn: [],
    });
    expect(balance.toString()).toBe('0.00');
  });

  it('balances both sides of a dollar purchase', () => {
    const pesos = accountBalance({
      currency: 'ARS',
      initialBalance: '2000000',
      transactions: [],
      transfersOut: [{ amount: '1250000' }],
      transfersIn: [],
    });
    const dollars = accountBalance({
      currency: 'USD',
      initialBalance: '0',
      transactions: [],
      transfersOut: [],
      transfersIn: [{ amount: '1000' }],
    });
    expect(pesos.toString()).toBe('750000.00');
    expect(dollars.toString()).toBe('1000.00');
    expect(dollars.currency).toBe('USD');
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
