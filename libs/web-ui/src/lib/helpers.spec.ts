import { parseLocalDate, parsePeriod } from '@platin/domain';
import {
  applyKey,
  displayAmount,
  isValidAmount,
  KeypadKey,
  parseTypedAmount,
} from './amount-keypad/amount-input';
import { dateBadge, formatDate, formatDayHeader, formatPeriod } from './format/format';

const type = (keys: string) =>
  [...keys].reduce((raw, key) => applyKey(raw, (key === '<' ? 'back' : key) as KeypadKey), '');

describe('amount keypad', () => {
  it('types integers and decimals', () => {
    expect(type('18500')).toBe('18500');
    expect(type('18500,5')).toBe('18500.5');
    expect(type('18500,55')).toBe('18500.55');
  });

  it('allows at most 2 decimals and one comma', () => {
    expect(type('1,234')).toBe('1.23');
    expect(type('1,,2')).toBe('1.2');
  });

  it('starts with 0, when the comma comes first', () => {
    expect(type(',5')).toBe('0.5');
    expect(type('005')).toBe('5');
  });

  it('deletes with backspace', () => {
    expect(type('185<')).toBe('18');
    expect(type('<')).toBe('');
  });

  it('displays with es-AR separators', () => {
    expect(displayAmount('18500')).toBe('18.500');
    expect(displayAmount('1850000.5')).toBe('1.850.000,5');
    expect(displayAmount('0.')).toBe('0,');
    expect(displayAmount('')).toBe('0');
  });

  it('validates and parses typed amounts', () => {
    expect(isValidAmount('18500.5')).toBe(true);
    expect(isValidAmount('0')).toBe(false);
    expect(isValidAmount('1.')).toBe(false);
    expect(parseTypedAmount('1.234,5')).toBe('1234.5');
    expect(parseTypedAmount('1234.50')).toBe('1234.50');
    expect(parseTypedAmount('100.000')).toBe('100000');
    expect(parseTypedAmount('1.850.000')).toBe('1850000');
    expect(parseTypedAmount('1,234')).toBeUndefined();
    expect(parseTypedAmount('abc')).toBeUndefined();
  });
});

describe('format', () => {
  const today = parseLocalDate('2026-10-23');

  it('formats periods', () => {
    expect(formatPeriod(parsePeriod('2026-10'))).toBe('Octubre 2026');
  });

  it('formats day headers like the Movimientos mockup', () => {
    expect(formatDayHeader(today, today)).toBe('Hoy · viernes 23');
    expect(formatDayHeader(parseLocalDate('2026-10-22'), today)).toBe('Ayer · jueves 22');
    expect(formatDayHeader(parseLocalDate('2026-10-20'), today)).toBe('Martes 20');
    expect(formatDayHeader(parseLocalDate('2026-09-03'), today)).toBe('3 de septiembre');
    expect(formatDayHeader(parseLocalDate('2025-12-31'), today)).toBe('31 de diciembre de 2025');
  });

  it('formats date badges and dates', () => {
    expect(dateBadge(parseLocalDate('2026-11-05'))).toEqual({ day: '05', month: 'NOV' });
    expect(formatDate(parseLocalDate('2026-10-23'))).toBe('23/10/2026');
  });
});
