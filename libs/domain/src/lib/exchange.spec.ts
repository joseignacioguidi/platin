import {
  amountIn,
  canConvert,
  convert,
  impliedRate,
  toBase,
  totalsByCurrency,
  valueIn,
} from './exchange';
import { Money } from './money';
import { ars, usd } from './test-helpers';

describe('exchange', () => {
  it('freezes rate and base amount for a USD movement with ARS base', () => {
    const result = toBase(usd('24.99'), 'ARS', '1250.50');
    expect(result.rateToBase).toBe('1250.500000');
    // 24.99 × 1250.50 = 31249.995 → half up
    expect(result.baseAmount.toString()).toBe('31250.00');
    expect(result.baseAmount.currency).toBe('ARS');
  });

  it('uses rate 1 for the base currency', () => {
    const result = toBase(ars('18500'), 'ARS', '1250');
    expect(result.rateToBase).toBe('1.000000');
    expect(result.baseAmount.toString()).toBe('18500.00');
  });

  it('converts ARS to a USD base with the exact factor', () => {
    const result = toBase(ars('100000'), 'USD', '1185.5');
    expect(result.rateToBase).toBe('0.000844');
    // Exact: 100000 / 1185.5 = 84.3526...
    expect(result.baseAmount.toString()).toBe('84.35');
  });

  it('rejects non-positive rates', () => {
    expect(() => toBase(usd('1'), 'ARS', '0')).toThrow();
  });

  it('computes the implied rate of buying and selling dollars', () => {
    expect(impliedRate(ars('1250000'), usd('1000'))).toBe('1250.000000');
    expect(impliedRate(usd('1000'), ars('1240000'))).toBe('1240.000000');
    expect(impliedRate(ars('10'), ars('10'))).toBeUndefined();
  });

  it('values and totals by currency', () => {
    expect(valueIn(usd('10'), 'ARS', '1200').toString()).toBe('12000.00');
    const totals = totalsByCurrency([ars('1000'), usd('10'), ars('500')], 'ARS', '1200');
    expect(totals.byCurrency.map((m) => m.toString())).toEqual(['1500.00', '10.00']);
    expect(totals.base.toString()).toBe('13500.00');
  });

  describe('varias monedas (MON-03): cruzando por el peso', () => {
    // Pesos por unidad: dólar MEP 1.200, euro 1.300, real 220, peso chileno 1,25, uruguayo 30.
    const rates = { USD: '1200', EUR: '1300', BRL: '220', CLP: '1.25', UYU: '30' };
    const eur = (amount: string) => Money.of(amount, 'EUR');

    it('EUR → USD = (ARS por EUR) / (ARS por USD)', () => {
      expect(convert(eur('100'), 'USD', rates).toString()).toBe('108.33');
      expect(convert(Money.of('108.33', 'USD'), 'EUR', rates).toString()).toBe('100.00');
    });

    it('cualquier moneda a pesos y de pesos', () => {
      expect(convert(eur('100'), 'ARS', rates).toString()).toBe('130000.00');
      expect(convert(Money.of('10000', 'CLP'), 'ARS', rates).toString()).toBe('12500.00');
      expect(convert(ars('1000'), 'BRL', rates).toString()).toBe('4.55');
      expect(convert(ars('1000'), 'UYU', rates).toString()).toBe('33.33');
    });

    it('redondea a 2 decimales, mitad hacia arriba, una sola vez', () => {
      // 1 CLP = 1,25 / 1.200 USD = 0,00104166… → 3 CLP = 0,003125 USD → 0,00
      expect(convert(Money.of('3', 'CLP'), 'USD', rates).toString()).toBe('0.00');
      // 5 CLP = 0,0052083… USD → 0,01
      expect(convert(Money.of('5', 'CLP'), 'USD', rates).toString()).toBe('0.01');
      // 0,5 UYU a pesos = 15,00; 0,005 USD no existe: siempre se parte de 2 decimales.
      expect(convert(Money.of('0.50', 'UYU'), 'ARS', rates).toString()).toBe('15.00');
    });

    it('congela el factor a la moneda base con 6 decimales', () => {
      const frozen = toBase(eur('100'), 'USD', rates);
      expect(frozen.rateToBase).toBe('1.083333');
      expect(frozen.baseAmount.toString()).toBe('108.33');
    });

    it('una tabla sin la moneda no convierte', () => {
      expect(canConvert('EUR', 'ARS', { USD: '1200' })).toBe(false);
      expect(canConvert('ARS', 'ARS', null)).toBe(true);
      expect(() => convert(eur('1'), 'ARS', { USD: '1200' })).toThrow();
    });

    it('una cotización suelta: pesos por unidad, o destino por origen entre otras', () => {
      expect(convert(eur('10'), 'ARS', '1300').toString()).toBe('13000.00');
      expect(convert(ars('1300'), 'EUR', '1300').toString()).toBe('1.00');
      expect(convert(eur('10'), 'USD', '1.08').toString()).toBe('10.80');
    });

    it('la cotización de una transferencia entre monedas', () => {
      expect(impliedRate(ars('130000'), eur('100'))).toBe('1300.000000');
      expect(impliedRate(eur('100'), Money.of('108', 'USD'))).toBe('1.080000');
    });

    it('suma por moneda solo las que aparecen, en orden, y valúa en la base', () => {
      const totals = totalsByCurrency(
        [eur('100'), ars('1000'), Money.of('50', 'BRL')],
        'ARS',
        rates,
      );
      expect(totals.byCurrency.map((m) => `${m.currency} ${m.toString()}`)).toEqual([
        'ARS 1000.00',
        'EUR 100.00',
        'BRL 50.00',
      ]);
      expect(totals.base.toString()).toBe('142000.00');
      expect(amountIn(totals.byCurrency, 'USD').toString()).toBe('0.00');
      // Without the euro rate, the euros stay in their line but out of the base total.
      const partial = totalsByCurrency([eur('100'), ars('1000')], 'ARS', { USD: '1200' });
      expect(partial.byCurrency).toHaveLength(2);
      expect(partial.base.toString()).toBe('1000.00');
    });
  });
});
