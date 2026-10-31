import { statementPeriodFor } from './card-cycle';
import {
  installmentProgress,
  regenerableInstallments,
  scheduleInstallments,
  splitInstallments,
  totalFromInstallment,
} from './installments';
import { Money } from './money';
import { ars, d, p } from './test-helpers';

describe('splitInstallments', () => {
  it('3 installments of $ 100.000 → 33.333,33 / 33.333,33 / 33.333,34', () => {
    expect(splitInstallments(ars('100000'), 3).map((i) => [i.number, i.amount.toString()])).toEqual(
      [
        [1, '33333.33'],
        [2, '33333.33'],
        [3, '33333.34'],
      ],
    );
  });

  it('a single payment is one installment for the total', () => {
    expect(splitInstallments(ars('18500'), 1).map((i) => i.amount.toString())).toEqual([
      '18500.00',
    ]);
  });

  it('installments always add up to the total', () => {
    const parts = splitInstallments(ars('550000'), 12);
    expect(parts).toHaveLength(12);
    expect(parts[0].amount.toString()).toBe('45833.33');
    expect(parts[11].amount.toString()).toBe('45833.37');
    expect(
      Money.sum(
        parts.map((i) => i.amount),
        'ARS',
      ).toString(),
    ).toBe('550000.00');
  });

  it('"voy por la 4 de 12" only generates installments 4 to 12', () => {
    const parts = splitInstallments(ars('550000'), 12, 4);
    expect(parts.map((i) => i.number)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(parts[parts.length - 1].amount.toString()).toBe('45833.37');
  });

  it('rejects invalid input', () => {
    expect(() => splitInstallments(ars('100'), 0)).toThrow();
    expect(() => splitInstallments(ars('100'), 3, 4)).toThrow();
    expect(() => splitInstallments(ars('100'), 3, 0)).toThrow();
    expect(() => splitInstallments(ars('0'), 3)).toThrow();
  });
});

describe('totalFromInstallment (TAR-02, por cuota)', () => {
  it('12 cuotas de $ 45.833,33 → total $ 549.999,96, todas iguales', () => {
    const total = totalFromInstallment(ars('45833.33'), 12);
    expect(total.toString()).toBe('549999.96');
    const amounts = splitInstallments(total, 12).map((i) => i.amount.toString());
    expect(new Set(amounts)).toEqual(new Set(['45833.33']));
    expect(amounts).toHaveLength(12);
  });

  it('1 cuota es el total', () => {
    expect(totalFromInstallment(ars('9.99'), 1).toString()).toBe('9.99');
  });

  it('rechaza cantidades y cuotas inválidas', () => {
    expect(() => totalFromInstallment(ars('100'), 0)).toThrow();
    expect(() => totalFromInstallment(ars('0'), 3)).toThrow();
  });
});

describe('scheduleInstallments', () => {
  const card = { closingDay: 30, dueDay: 5 };

  it('$ 550.000 in 12 installments the day before closing starts in that statement', () => {
    const first = statementPeriodFor(card, d('2026-10-29'));
    const plan = scheduleInstallments(splitInstallments(ars('550000'), 12), first);
    expect(plan[0].period).toBe('2026-10');
    expect(plan[11].period).toBe('2027-09');
  });

  it('the day after closing starts in the next statement', () => {
    const first = statementPeriodFor(card, d('2026-10-31'));
    const plan = scheduleInstallments(splitInstallments(ars('550000'), 12), first);
    expect(plan[0].period).toBe('2026-11');
    expect(plan[11].period).toBe('2027-10');
  });

  it('a migrated plan starts at the open statement', () => {
    const plan = scheduleInstallments(splitInstallments(ars('550000'), 12, 4), p('2026-10'));
    expect(plan.map((i) => [i.number, i.period])).toEqual([
      [4, '2026-10'],
      [5, '2026-11'],
      [6, '2026-12'],
      [7, '2027-01'],
      [8, '2027-02'],
      [9, '2027-03'],
      [10, '2027-04'],
      [11, '2027-05'],
      [12, '2027-06'],
    ]);
  });
});

describe('installmentProgress', () => {
  const plan = splitInstallments(ars('550000'), 12);

  it('remaining = N minus installments in closed statements', () => {
    const states = plan.map((i) => ({ ...i, inClosedStatement: i.number <= 4 }));
    const progress = installmentProgress(12, states, 'ARS');
    expect(progress.current).toBe(4);
    expect(progress.remainingCount).toBe(8);
    expect(progress.remainingAmount.toString()).toBe('366666.68');
  });

  it('a new plan has nothing closed', () => {
    const progress = installmentProgress(
      12,
      plan.map((i) => ({ ...i, inClosedStatement: false })),
      'ARS',
    );
    expect(progress.current).toBe(0);
    expect(progress.remainingCount).toBe(12);
    expect(progress.remainingAmount.toString()).toBe('550000.00');
  });

  it('a migrated "4 of 12" plan counts installments 1 to 3 as already paid', () => {
    const migrated = splitInstallments(ars('550000'), 12, 4).map((i) => ({
      ...i,
      inClosedStatement: false,
    }));
    const progress = installmentProgress(12, migrated, 'ARS');
    expect(progress.current).toBe(3);
    expect(progress.remainingCount).toBe(9);
  });

  it('only installments in open statements can be regenerated', () => {
    const states = plan.map((i) => ({ ...i, inClosedStatement: i.number <= 2 }));
    expect(regenerableInstallments(states).map((i) => i.number)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
});
