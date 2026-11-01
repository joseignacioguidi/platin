import { PocketKind } from './enums';
import { freeThisMonth, separatedThisMonth, SeparatedTransfer, transferBaseValue } from './free';
import { Money } from './money';
import { ars, usd } from './test-helpers';

const kinds = new Map<string, PocketKind>([
  ['galicia', PocketKind.AVAILABLE],
  ['mp', PocketKind.AVAILABLE],
  ['usd', PocketKind.AVAILABLE],
  ['cedears', PocketKind.INVESTMENT],
  ['fci', PocketKind.INVESTMENT],
  ['reserva', PocketKind.SAVINGS],
]);

const t = (from: string, to: string | null, value: Money): SeparatedTransfer => ({
  fromPocketId: from,
  toPocketId: to,
  value,
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

describe('Libre este mes (spec example)', () => {
  const transfers = [t('galicia', 'cedears', ars('150000')), t('galicia', 'reserva', ars('50000'))];

  it('invest 150.000 and set apart 50.000: free = $ 370.000', () => {
    const separated = separatedThisMonth(transfers, kinds, 'ARS');
    expect(separated.toString()).toBe('200000.00');
    expect(freeThisMonth(ars('1200000'), ars('380000'), ars('250000'), separated).toString()).toBe(
      '370000.00',
    );
  });

  it('then redeem 30.000 from the reserve: free = $ 400.000', () => {
    const separated = separatedThisMonth(
      [...transfers, t('reserva', 'galicia', ars('30000'))],
      kinds,
      'ARS',
    );
    expect(freeThisMonth(ars('1200000'), ars('380000'), ars('250000'), separated).toString()).toBe(
      '400000.00',
    );
  });
});

describe('separatedThisMonth', () => {
  it('ignores transfers between available pockets', () => {
    expect(separatedThisMonth([t('galicia', 'mp', ars('1000'))], kinds, 'ARS').isZero()).toBe(true);
  });

  it('ignores transfers between savings and investment pockets', () => {
    expect(
      separatedThisMonth(
        [t('reserva', 'cedears', ars('1000')), t('cedears', 'fci', ars('500'))],
        kinds,
        'ARS',
      ).isZero(),
    ).toBe(true);
  });

  it('ignores statement payments (no destination)', () => {
    expect(separatedThisMonth([t('galicia', null, ars('1000'))], kinds, 'ARS').isZero()).toBe(true);
  });

  it('can be negative when more was redeemed than set apart', () => {
    expect(
      separatedThisMonth(
        [t('galicia', 'reserva', ars('100')), t('cedears', 'galicia', ars('300'))],
        kinds,
        'ARS',
      ).toString(),
    ).toBe('-200.00');
  });

  it('adds transfers between currencies by their base value', () => {
    // USD 100 bought with $ 120.000 into a dollar investment: counts the pesos paid.
    const value = transferBaseValue(ars('120000'), usd('100'), 'ARS', null);
    expect(separatedThisMonth([t('galicia', 'cedears', value)], kinds, 'ARS').toString()).toBe(
      '120000.00',
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
