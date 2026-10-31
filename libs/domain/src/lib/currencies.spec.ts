import { blockedCurrencies, normalizeCurrencies } from './currencies';

describe('normalizeCurrencies (MON-01)', () => {
  it('pesos y la moneda base siempre están, sin repetir y en orden', () => {
    expect(normalizeCurrencies(['EUR', 'USD', 'EUR'], 'ARS')).toEqual(['ARS', 'USD', 'EUR']);
    expect(normalizeCurrencies([], 'USD')).toEqual(['ARS', 'USD']);
    expect(normalizeCurrencies(['UYU', 'BRL', 'CLP'], 'ARS')).toEqual(['ARS', 'BRL', 'CLP', 'UYU']);
  });
});

describe('blockedCurrencies (MON-04)', () => {
  it('no se puede desactivar una moneda que usa algo activo', () => {
    expect(blockedCurrencies(['EUR', 'BRL'], ['ARS', 'EUR'])).toEqual(['EUR']);
    expect(blockedCurrencies(['BRL'], ['ARS', 'EUR'])).toEqual([]);
  });
});
