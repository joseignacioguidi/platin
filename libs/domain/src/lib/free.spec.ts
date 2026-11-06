import {
  accountCoverage,
  daysLeftIn,
  freePerDay,
  freeThisMonth,
  savedThisMonth,
  SavedTransfer,
  transferBaseValue,
} from './free';
import { Money } from './money';
import { splitInstallments } from './installments';
import { ars, d, p, usd } from './test-helpers';

const zero = ars('0');

describe('Libre este mes (spec example)', () => {
  // Saldo $ 726.150 + reservas para gastar $ 220.000 + $ 120.000 + $ 110.000.
  const inAccounts = ars('726150').add(ars('220000')).add(ars('120000')).add(ars('110000'));
  const toPay = ars('379418.27');

  it('free = $ 796.731,73', () => {
    expect(inAccounts.toString()).toBe('1176150.00');
    expect(freeThisMonth({ inAccounts, toCollect: zero, toPay }).toString()).toBe('796731.73');
  });

  // On the 20th, $ 90.000 in 3 installments due in December, January and February: nothing is
  // due this month, so "to pay" and the free amount stay the same.
  it('after a card purchase in 3 installments due later: free = $ 796.731,73', () => {
    expect(freeThisMonth({ inAccounts, toCollect: zero, toPay }).toString()).toBe('796731.73');
  });

  it('then $ 200.000 from the balance to Auto (savings): free = $ 596.731,73', () => {
    expect(
      freeThisMonth({
        inAccounts: inAccounts.subtract(ars('200000')),
        toCollect: zero,
        toPay,
      }).toString(),
    ).toBe('596731.73');
  });
});

describe('freeThisMonth', () => {
  it('adds what is to collect and can be negative', () => {
    expect(
      freeThisMonth({
        inAccounts: ars('100'),
        toCollect: ars('50'),
        toPay: ars('180'),
      }).toString(),
    ).toBe('-30.00');
  });

  it('a purchase due partly this month only counts the installment due this month', () => {
    // $ 30.000 in 3: the first installment is in the statement due on Nov 28 (in "to pay").
    const [first] = splitInstallments(ars('30000'), 3).map((i) => i.amount);
    expect(
      freeThisMonth({ inAccounts: ars('100000'), toCollect: zero, toPay: first }).toString(),
    ).toBe('90000.00');
  });

  it('a previous month is what was left in the accounts on its last day', () => {
    expect(
      freeThisMonth({ inAccounts: ars('412300'), toCollect: zero, toPay: zero }).toString(),
    ).toBe('412300.00');
  });
});

const t = (
  fromKind: SavedTransfer['fromKind'],
  toKind: SavedTransfer['toKind'],
  value: Money,
): SavedTransfer => ({ fromKind, toKind, value });

describe('savedThisMonth', () => {
  it('adds what goes to savings or investments and subtracts what comes back', () => {
    expect(
      savedThisMonth(
        [
          t('AVAILABLE', 'INVESTMENT', ars('150000')),
          t('SPENDING', 'SAVINGS', ars('50000')),
          t('SAVINGS', 'AVAILABLE', ars('30000')),
        ],
        'ARS',
      ).toString(),
    ).toBe('170000.00');
  });

  it('ignores moves between accounts, spending reserves and statement payments', () => {
    expect(
      savedThisMonth(
        [
          t('AVAILABLE', 'AVAILABLE', ars('1000')),
          t('AVAILABLE', 'SPENDING', ars('1000')),
          t('AVAILABLE', null, ars('1000')),
        ],
        'ARS',
      ).isZero(),
    ).toBe(true);
  });

  it('can be negative when more was redeemed than saved', () => {
    expect(savedThisMonth([t('INVESTMENT', 'AVAILABLE', ars('300'))], 'ARS').toString()).toBe(
      '-300.00',
    );
  });
});

describe('transferBaseValue', () => {
  it('uses the side in base currency', () => {
    expect(transferBaseValue(ars('1200'), usd('1'), 'ARS', '1500').toString()).toBe('1200.00');
    expect(transferBaseValue(usd('1'), ars('1150'), 'ARS', '1500').toString()).toBe('1150.00');
  });

  it('values with the given rate when neither side is in base currency', () => {
    expect(transferBaseValue(usd('10'), usd('10'), 'ARS', '1200').toString()).toBe('12000.00');
  });

  it('is zero without a usable rate', () => {
    expect(transferBaseValue(usd('10'), usd('10'), 'ARS', null).isZero()).toBe(true);
  });
});

describe('Por día (spec example)', () => {
  it('on 5/11 with a free amount of $ 106.061,83: 26 days left, $ 4.079 per day', () => {
    expect(daysLeftIn(p('2026-11'), d('2026-11-05'))).toBe(26);
    expect(freePerDay(ars('106061.83'), d('2026-11-05'), p('2026-11'))?.toString()).toBe('4079.00');
  });

  it('has no per day when the free amount is zero or negative', () => {
    expect(freePerDay(ars('0'), d('2026-11-05'), p('2026-11'))).toBeNull();
    expect(freePerDay(ars('-1500.50'), d('2026-11-05'), p('2026-11'))).toBeNull();
  });

  it('on the last day of the month all of it is for today', () => {
    expect(daysLeftIn(p('2026-11'), d('2026-11-30'))).toBe(1);
    expect(freePerDay(ars('1234.56'), d('2026-11-30'), p('2026-11'))?.toString()).toBe('1234.00');
  });

  it('has no per day in a previous month', () => {
    expect(daysLeftIn(p('2026-10'), d('2026-11-05'))).toBe(0);
    expect(freePerDay(ars('50000'), d('2026-11-05'), p('2026-10'))).toBeNull();
  });

  it('counts February of a leap year', () => {
    expect(daysLeftIn(p('2028-02'), d('2028-02-01'))).toBe(29);
  });
});

describe('Lo que tiene cada cuenta para gastar', () => {
  it('covers what it pays this month when it has as much or more', () => {
    expect(accountCoverage(ars('490780'), ars('379418.27'))).toEqual({
      covered: true,
      shortfall: ars('0'),
    });
    expect(accountCoverage(ars('100'), ars('100')).covered).toBe(true);
  });

  it('says how much is missing when it does not reach', () => {
    const coverage = accountCoverage(ars('20000'), ars('53452.10'));
    expect(coverage.covered).toBe(false);
    expect(coverage.shortfall.toString()).toBe('33452.10');
  });
});
