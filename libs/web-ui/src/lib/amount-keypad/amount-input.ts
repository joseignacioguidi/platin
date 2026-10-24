/**
 * Pure helpers for typing an amount with a keypad. The raw value is a decimal string with a
 * dot ("18500.5"), ready for the API; the display uses es-AR separators ("18.500,5").
 */

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'back';

const MAX_INTEGER_DIGITS = 12;

/** Applies one key press to the raw amount. Invalid presses leave it unchanged. */
export function applyKey(raw: string, key: KeypadKey): string {
  if (key === 'back') return raw.slice(0, -1);
  const [integer, decimals] = raw.split('.');
  if (key === ',') {
    if (raw.includes('.')) return raw;
    return `${raw || '0'}.`;
  }
  if (decimals !== undefined) return decimals.length >= 2 ? raw : `${raw}${key}`;
  if (integer === '0') return key;
  if (integer.length >= MAX_INTEGER_DIGITS) return raw;
  return `${raw}${key}`;
}

/** "18500.5" → "18.500,5"; empty → "0". */
export function displayAmount(raw: string): string {
  if (!raw) return '0';
  const [integer, decimals] = raw.split('.');
  const grouped = (integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals === undefined ? grouped : `${grouped},${decimals}`;
}

/** Whether the raw value is a positive amount the API accepts. */
export function isValidAmount(raw: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(raw) && Number.parseFloat(raw) > 0;
}

/**
 * Normalizes a typed value to the raw format, reading es-AR separators: "1.234,5", "100.000"
 * (thousands) and also "1234.50". Undefined if invalid.
 */
export function parseTypedAmount(value: string): string | undefined {
  const trimmed = value.trim().replace(/\s/g, '');
  if (!trimmed) return undefined;
  let normalized: string;
  if (trimmed.includes(',')) normalized = trimmed.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) normalized = trimmed.replace(/\./g, '');
  else normalized = trimmed;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, '') : undefined;
}
