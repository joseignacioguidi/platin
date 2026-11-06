import type { TextEntryGlobalRule } from './text-entry';

const group = (categoryName: string, patterns: string[]): TextEntryGlobalRule[] =>
  patterns.map((pattern) => ({ pattern, categoryName }));

/**
 * TXT-04: global rules for common merchants in Argentina, until the admin changes them.
 * They point to the name of a suggested category; normalized patterns (no accents, lowercase).
 */
export const DEFAULT_MERCHANT_RULES: readonly TextEntryGlobalRule[] = [
  ...group('Supermercado', [
    'coto',
    'carrefour',
    'dia',
    'jumbo',
    'disco',
    'vea',
    'changomas',
    'la anonima',
    'makro',
  ]),
  ...group('Delivery', ['rappi', 'pedidosya']),
  ...group('Nafta', ['ypf', 'shell', 'axion', 'puma']),
  ...group('Transporte', ['uber', 'cabify', 'didi', 'sube']),
  ...group('Suscripciones', ['netflix', 'spotify', 'disney', 'max', 'prime', 'youtube', 'icloud']),
  ...group('Servicios', [
    'edenor',
    'edesur',
    'metrogas',
    'aysa',
    'personal',
    'movistar',
    'claro',
    'telecentro',
  ]),
  ...group('Farmacia', ['farmacity']),
];
