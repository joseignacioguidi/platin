import type { Movement } from '@platin/contracts';
import { Money, parsePeriod } from '@platin/domain';
import { monthEndBalances } from './pocket-balance-history';

const pocket = {
  id: 'p1',
  name: 'Ahorro',
  accountId: 'a1',
  accountName: 'MP',
  currency: 'ARS' as const,
};
const other = { ...pocket, id: 'p2', name: 'Disponible' };

const transfer = (date: string, amount: string, into: boolean): Movement => ({
  kind: 'TRANSFER',
  id: date,
  date,
  amountOut: amount,
  currencyOut: 'ARS',
  amountIn: amount,
  currencyIn: 'ARS',
  impliedRate: null,
  description: null,
  fromPocket: into ? other : pocket,
  toPocket: into ? pocket : other,
  intent: into ? 'SAVE' : 'REDEEM',
  statement: null,
});

describe('monthEndBalances', () => {
  // Newest first, as the API lists them.
  const movements = [
    transfer('2026-10-10', '30000', false),
    transfer('2026-09-05', '100000', true),
    transfer('2026-08-20', '50000', true),
  ];

  it('walks back from the current balance', () => {
    const rows = monthEndBalances(
      'p1',
      Money.of('120000', 'ARS'),
      movements,
      parsePeriod('2026-10'),
      4,
      true,
    );
    expect(rows.map((r) => `${r.period} ${r.balance.toString()}`)).toEqual([
      '2026-07 0.00',
      '2026-08 50000.00',
      '2026-09 150000.00',
      '2026-10 120000.00',
    ]);
  });

  it('leaves out months older than an incomplete list', () => {
    const rows = monthEndBalances(
      'p1',
      Money.of('120000', 'ARS'),
      movements.slice(0, 2),
      parsePeriod('2026-10'),
      4,
      false,
    );
    // Unloaded movements could sit between August 31 and September 5.
    expect(rows.map((r) => r.period)).toEqual(['2026-09', '2026-10']);
  });
});
