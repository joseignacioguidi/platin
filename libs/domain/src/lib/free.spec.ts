import { cardLater, freeThisMonth, savedThisMonth, SavedTransfer, transferBaseValue } from './free';
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
    expect(freeThisMonth({ inAccounts, toCollect: zero, toPay, cardLater: zero }).toString()).toBe(
      '796731.73',
    );
  });

  // On the 20th, $ 90.000 in 3 installments due in December, January and February.
  const purchase = splitInstallments(ars('90000'), 3).map(({ amount: value }, i) => ({
    chargeDate: d('2026-11-20'),
    dueDate: [d('2026-12-10'), d('2027-01-10'), d('2027-02-10')][i],
    value,
  }));

  it('after a card purchase in 3 installments: free = $ 706.731,73', () => {
    const later = cardLater(purchase, p('2026-11'), 'ARS');
    expect(later.toString()).toBe('90000.00');
    expect(freeThisMonth({ inAccounts, toCollect: zero, toPay, cardLater: later }).toString()).toBe(
      '706731.73',
    );
  });

  it('then $ 200.000 from the balance to Auto (savings): free = $ 506.731,73', () => {
    const later = cardLater(purchase, p('2026-11'), 'ARS');
    expect(
      freeThisMonth({
        inAccounts: inAccounts.subtract(ars('200000')),
        toCollect: zero,
        toPay,
        cardLater: later,
      }).toString(),
    ).toBe('506731.73');
  });
});

describe('freeThisMonth', () => {
  it('adds what is to collect and can be negative', () => {
    expect(
      freeThisMonth({
        inAccounts: ars('100'),
        toCollect: ars('50'),
        toPay: ars('120'),
        cardLater: ars('60'),
      }).toString(),
    ).toBe('-30.00');
  });

  it('a purchase due partly this month and partly later counts once', () => {
    // $ 30.000 in 3: the first installment is in the statement due on Nov 28 (in "to pay").
    const [first, ...rest] = splitInstallments(ars('30000'), 3).map((i) => i.amount);
    const installments = [
      { chargeDate: d('2026-11-03'), dueDate: d('2026-11-28'), value: first },
      { chargeDate: d('2026-11-03'), dueDate: d('2026-12-28'), value: rest[0] },
      { chargeDate: d('2026-11-03'), dueDate: d('2027-01-28'), value: rest[1] },
    ];
    const later = cardLater(installments, p('2026-11'), 'ARS');
    expect(later.toString()).toBe('20000.00');
    expect(
      freeThisMonth({
        inAccounts: ars('100000'),
        toCollect: zero,
        toPay: first,
        cardLater: later,
      }).toString(),
    ).toBe('70000.00');
  });

  it('a previous month is what was left in the accounts on its last day', () => {
    expect(
      freeThisMonth({
        inAccounts: ars('412300'),
        toCollect: zero,
        toPay: zero,
        cardLater: zero,
      }).toString(),
    ).toBe('412300.00');
  });
});

describe('cardLater', () => {
  it('ignores purchases of other months', () => {
    const installments = [
      { chargeDate: d('2026-10-31'), dueDate: d('2027-01-10'), value: ars('1000') },
    ];
    expect(cardLater(installments, p('2026-11'), 'ARS').isZero()).toBe(true);
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
