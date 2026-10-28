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
