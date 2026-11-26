import type { Instrument } from '@platin/contracts';
import { toDecimal } from '@platin/domain';
import type { PlStackTone } from '@platin/web-ui';

/** Color of each instrument in the composition bar and the list (palette tokens only). */
export const INSTRUMENT_TONES: Record<Instrument, PlStackTone> = {
  CEDEAR: 'transfer',
  STOCK: 'card',
  MUTUAL_FUND: 'savings',
  TERM_DEPOSIT: 'brand',
  CRYPTO: 'pending',
  OTHER: 'expense',
};

/** Background class of each tone, for legend dots and row markers. */
export const TONE_BG: Record<PlStackTone, string> = {
  expense: 'bg-expense',
  muted: 'bg-muted',
  card: 'bg-card',
  brand: 'bg-brand',
  pending: 'bg-pending',
  transfer: 'bg-transfer',
  savings: 'bg-savings',
};

/** "0.0790" → "+7,9 %" (one decimal, es-AR, always signed). */
export function formatRate(rate: string): string {
  const percent = toDecimal(rate).times(100).toDecimalPlaces(1);
  const sign = percent.isNegative() ? '−' : '+';
  return `${sign}${percent.abs().toFixed(1).replace('.', ',')} %`;
}

/** "30" or "29,5" (a percentage as typed) → "0.300000"; undefined if it is not a rate. */
export function tnaFromPercent(typed: string): string | undefined {
  const value = typed.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(value)) return undefined;
  const ratio = toDecimal(value).dividedBy(100);
  return ratio.greaterThanOrEqualTo(100) ? undefined : ratio.toFixed(6);
}

/** "0.300000" → "30"; "0.295000" → "29,5". */
export function percentFromTna(tna: string): string {
  return toDecimal(tna).times(100).toDecimalPlaces(4).toString().replace('.', ',');
}

/** Units as typed ("24,25357324" or "24.25"): up to 8 decimals; undefined otherwise. */
export function parseTypedUnits(typed: string): string | undefined {
  const value = typed.trim().replace(/\s/g, '').replace(',', '.');
  return /^\d{1,16}(\.\d{1,8})?$/.test(value) ? value.replace(/^0+(?=\d)/, '') : undefined;
}

/** "174.25357324" → "174,25357324"; "150.00000000" → "150" (es-AR, no trailing zeros). */
export function formatUnits(units: string): string {
  const [whole, decimals = ''] = toDecimal(units).toFixed(8).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const trimmed = decimals.replace(/0+$/, '');
  return trimmed ? `${grouped},${trimmed}` : grouped;
}
