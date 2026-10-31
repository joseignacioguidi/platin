import { CURRENCIES, Currency } from './enums';

/**
 * MON-01: the enabled currencies as stored and shown: pesos and the base currency are always
 * there, no repeats, in the app's order.
 */
export function normalizeCurrencies(list: readonly Currency[], base: Currency): Currency[] {
  const wanted = new Set<Currency>([...list, Currency.ARS, base]);
  return CURRENCIES.filter((currency) => wanted.has(currency));
}

/**
 * MON-04: the currencies that can't be turned off because an active pocket, an active fixed item
 * or an active goal uses them (history doesn't count). Pesos and the base never turn off.
 */
export function blockedCurrencies(
  turningOff: readonly Currency[],
  inUse: readonly Currency[],
): Currency[] {
  const used = new Set(inUse);
  return turningOff.filter((currency) => used.has(currency));
}
