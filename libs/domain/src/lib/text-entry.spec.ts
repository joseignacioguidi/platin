import { describe, expect, it } from 'vitest';
import type { LocalDate } from './dates';
import { DEFAULT_MERCHANT_RULES } from './merchant-rules';
import {
  checkTextEntryDraft,
  normalizeAlias,
  normalizePattern,
  parseTextEntry,
  type TextEntryContext,
  type TextEntryDraft,
  type TextEntryResult,
} from './text-entry';

const TODAY = '2026-11-05' as LocalDate;
const MP = { kind: 'ACCOUNT', id: 'acc-mp' } as const;
const CASH = { kind: 'ACCOUNT', id: 'acc-cash' } as const;
const VISA = { kind: 'CARD', id: 'card-visa' } as const;

const context: TextEntryContext = {
  today: TODAY,
  aliases: [
    { alias: 'mp', source: MP },
    { alias: 'mercado', source: MP },
    { alias: 'efe', source: CASH },
    { alias: 'visa', source: VISA },
  ],
  rules: [{ pattern: 'cafe', categoryId: 'cat-salidas' }],
  globalRules: DEFAULT_MERCHANT_RULES,
  categories: [
    { id: 'cat-super', name: 'Supermercado', kind: 'EXPENSE' },
    { id: 'cat-salidas', name: 'Salidas', kind: 'EXPENSE' },
    { id: 'cat-nafta', name: 'Nafta', kind: 'EXPENSE' },
    { id: 'cat-subs', name: 'Suscripciones', kind: 'EXPENSE' },
    { id: 'cat-salud', name: 'Salud', kind: 'EXPENSE' },
    { id: 'cat-rapida', name: 'Comida rápida', kind: 'EXPENSE' },
    { id: 'cat-casera', name: 'Comida casera', kind: 'EXPENSE' },
    { id: 'cat-sueldo', name: 'Sueldo', kind: 'INCOME' },
    { id: 'cat-freelance', name: 'Freelance', kind: 'INCOME' },
  ],
};

function parse(text: string, overrides: Partial<TextEntryContext> = {}): TextEntryResult {
  return parseTextEntry(text, { ...context, ...overrides });
}

function draft(text: string, overrides: Partial<TextEntryContext> = {}): TextEntryDraft {
  const result = parse(text, overrides);
  if (!result.ok) throw new Error(`"${text}" failed with ${result.error}`);
  return result.draft;
}

function error(text: string, overrides: Partial<TextEntryContext> = {}): string | null {
  const result = parse(text, overrides);
  return result.ok ? null : result.error;
}

describe('parseTextEntry: the table of the specification (today = 5/11/2026)', () => {
  it('café 3500 → expense of $ 3.500, reason "café", category by rule, today', () => {
    expect(draft('café 3500')).toEqual({
      type: 'EXPENSE',
      amount: '3500.00',
      currency: 'ARS',
      source: null,
      installments: 1,
      date: TODAY,
      scheduled: false,
      description: 'café',
      categoryId: 'cat-salidas',
    });
  });

  it('super 45k visa 3c → card purchase of $ 45.000 in 3 installments, Supermercado', () => {
    expect(draft('super 45k visa 3c')).toMatchObject({
      type: 'EXPENSE',
      amount: '45000.00',
      currency: 'ARS',
      source: VISA,
      installments: 3,
      date: TODAY,
      scheduled: false,
      description: 'super',
      categoryId: 'cat-super',
    });
  });

  it('sueldo 1.800.000 mp → income of $ 1.800.000 in Mercado Pago, Sueldo', () => {
    expect(draft('sueldo 1.800.000 mp')).toMatchObject({
      type: 'INCOME',
      amount: '1800000.00',
      source: MP,
      description: 'sueldo',
      categoryId: 'cat-sueldo',
    });
  });

  it('pagué el plomero con efe 28 lucas ayer → $ 28.000 cash, "plomero", 4/11, no category', () => {
    expect(draft('pagué el plomero con efe 28 lucas ayer')).toMatchObject({
      type: 'EXPENSE',
      amount: '28000.00',
      source: CASH,
      date: '2026-11-04',
      scheduled: false,
      description: 'plomero',
      categoryId: null,
    });
  });

  it('netflix usd 20 → expense of USD 20', () => {
    expect(draft('netflix usd 20')).toMatchObject({
      type: 'EXPENSE',
      amount: '20.00',
      currency: 'USD',
      description: 'netflix',
      categoryId: 'cat-subs',
    });
  });

  it('turno médico 15000 el próximo 20 → scheduled expense of $ 15.000 on 20/11', () => {
    expect(draft('turno médico 15000 el próximo 20')).toMatchObject({
      amount: '15000.00',
      date: '2026-11-20',
      scheduled: true,
      description: 'turno médico',
    });
  });

  it('turno médico el 20 15000 → AMBIGUOUS_DATE: 20/10 or 20/11', () => {
    const result = parse('turno médico el 20 15000');
    expect(result.ok).toBe(false);
    if (result.ok || result.error !== 'AMBIGUOUS_DATE') throw new Error('expected AMBIGUOUS_DATE');
    expect(result.options.map((option) => [option.date, option.scheduled])).toEqual([
      ['2026-10-20', false],
      ['2026-11-20', true],
    ]);
    expect(result.options[0]).toMatchObject({ amount: '15000.00', description: 'turno médico' });
  });

  it('zapatillas 90000 visa el 20 → card purchase of 20/10', () => {
    expect(draft('zapatillas 90000 visa el 20')).toMatchObject({
      source: VISA,
      date: '2026-10-20',
      scheduled: false,
      description: 'zapatillas',
    });
  });

  it.each([
    ['zapatillas 90000 visa mañana', 'CARD_CANNOT_BE_SCHEDULED'],
    ['heladera 900000 3c', 'INSTALLMENTS_WITHOUT_CARD'],
    ['super 5000 mp visa', 'SEVERAL_SOURCES'],
    ['+ 5000 visa', 'INCOME_ON_CARD'],
    ['taxi 8000 31/2', 'INVALID_DATE'],
  ])('%s → %s', (text, code) => {
    expect(error(text)).toBe(code);
  });
});

describe('parseTextEntry: amounts', () => {
  it.each([
    ['3500', '3500.00'],
    ['3.500', '3500.00'],
    ['1.250.000', '1250000.00'],
    ['1.500,50', '1500.50'],
    ['$3500', '3500.00'],
    ['45k', '45000.00'],
    ['45 mil', '45000.00'],
    ['3,5k', '3500.00'],
    ['28 lucas', '28000.00'],
    ['1,5 palos', '1500000.00'],
    ['1,5m', '1500000.00'],
    ['1.500', '1500.00'],
    ['1.5', '1.50'],
    ['10,555', '10.56'],
  ])('"cosa %s" is %s', (text, amount) => {
    expect(draft(`cosa ${text}`).amount).toBe(amount);
  });

  it('no amount, zero and several amounts', () => {
    expect(error('café')).toBe('NO_AMOUNT');
    expect(error('café 0')).toBe('ZERO_AMOUNT');
    expect(error('luz 18000 y gas 12000')).toBe('SEVERAL_AMOUNTS');
  });

  it('"1.5000" is not an amount', () => {
    expect(error('cosa 1.5000')).toBe('NO_AMOUNT');
  });
});

describe('parseTextEntry: currency', () => {
  it.each([
    ['usd', 'USD'],
    ['u$s', 'USD'],
    ['u$d', 'USD'],
    ['us$', 'USD'],
    ['dólar', 'USD'],
    ['dólares', 'USD'],
    ['verdes', 'USD'],
    ['eur', 'EUR'],
    ['euro', 'EUR'],
    ['euros', 'EUR'],
    ['brl', 'BRL'],
    ['real', 'BRL'],
    ['reales', 'BRL'],
    ['clp', 'CLP'],
    ['chilenos', 'CLP'],
    ['pesos chilenos', 'CLP'],
    ['uyu', 'UYU'],
    ['uruguayos', 'UYU'],
    ['ars', 'ARS'],
    ['pesos', 'ARS'],
  ])('"cosa 20 %s" is in %s', (word, currency) => {
    const result = draft(`cosa 20 ${word}`);
    expect(result.currency).toBe(currency);
    expect(result.description).toBe('cosa');
  });

  it('glued to the amount and pesos by default', () => {
    expect(draft('cosa 20usd').currency).toBe('USD');
    expect(draft('cosa usd20').currency).toBe('USD');
    expect(draft('cosa 20').currency).toBe('ARS');
  });

  it('a card only takes pesos and dollars', () => {
    expect(draft('cosa 20 usd visa').source).toEqual(VISA);
    expect(error('cosa 20 euros visa')).toBe('CARD_CURRENCY');
  });
});

describe('parseTextEntry: type', () => {
  it.each(['+ 5000 freelance', '+5000', 'cobré 5000', 'cobro 5000', 'ingreso 5000', 'aguinaldo 5000'])(
    '%s is an income',
    (text) => {
      expect(draft(text).type).toBe('INCOME');
    },
  );

  it('the income word stays in the reason, the + does not', () => {
    expect(draft('cobré 5000 alquiler').description).toBe('cobré alquiler');
    expect(draft('+ 50000 freelance')).toMatchObject({
      description: 'freelance',
      categoryId: 'cat-freelance',
    });
  });

  it('an expense by default', () => {
    expect(draft('pan 1200').type).toBe('EXPENSE');
  });
});

describe('parseTextEntry: account or card', () => {
  it('by alias, ignoring case and accents', () => {
    expect(draft('pan 1200 MP').source).toEqual(MP);
    expect(draft('pan 1200 Mercado').source).toEqual(MP);
    expect(draft('pan 1200 mercado pago', {
      aliases: [{ alias: 'mercadopago', source: MP }],
    }).source).toEqual(MP);
  });

  it('two aliases of the same account are not several sources', () => {
    expect(draft('pan 1200 mp mercado').source).toEqual(MP);
  });

  it('without an alias, the last one used when it fits', () => {
    expect(draft('pan 1200', { lastUsed: CASH }).source).toEqual(CASH);
    expect(draft('pan 1200', { lastUsed: VISA }).source).toEqual(VISA);
    expect(draft('heladera 900000 3c', { lastUsed: VISA })).toMatchObject({
      source: VISA,
      installments: 3,
    });
    // A card does not take incomes, other currencies or scheduled dates: the form decides.
    expect(draft('+ 5000', { lastUsed: VISA }).source).toBeNull();
    expect(draft('pan 20 euros', { lastUsed: VISA }).source).toBeNull();
    expect(draft('pan 1200 mañana', { lastUsed: VISA })).toMatchObject({
      source: null,
      scheduled: true,
    });
    expect(error('pan 1200 el 20', { lastUsed: VISA })).toBe('AMBIGUOUS_DATE');
  });
});

describe('parseTextEntry: installments', () => {
  it.each(['3c', 'x3', '3cuotas', '3 cuotas', 'en 3 cuotas'])('"tele 300000 visa %s" is 3', (word) => {
    expect(draft(`tele 300000 visa ${word}`)).toMatchObject({
      installments: 3,
      description: 'tele',
    });
  });

  it('from 1 to 60', () => {
    expect(draft('tele 300000 visa 1c').installments).toBe(1);
    expect(draft('tele 300000 visa 60c').installments).toBe(60);
    expect(error('tele 300000 visa 61c')).toBe('TOO_MANY_INSTALLMENTS');
  });

  it('only with a card', () => {
    expect(error('tele 300000 mp 3c')).toBe('INSTALLMENTS_WITHOUT_CARD');
    expect(draft('tele 300000 mp 1c').installments).toBe(1);
  });
});

describe('parseTextEntry: dates', () => {
  const dateOf = (text: string, overrides: Partial<TextEntryContext> = {}) =>
    draft(`pan 1200 ${text}`, overrides);

  it.each([
    ['hoy', '2026-11-05', false],
    ['ayer', '2026-11-04', false],
    ['anteayer', '2026-11-03', false],
    ['mañana', '2026-11-06', true],
    ['pasado mañana', '2026-11-07', true],
    ['el 3', '2026-11-03', false],
    ['el próximo 20', '2026-11-20', true],
    ['el 20 que viene', '2026-11-20', true],
    ['el próximo 3', '2026-12-03', true],
    ['3/11', '2026-11-03', false],
    ['20/10', '2026-10-20', false],
    ['1/10', '2027-10-01', true],
    ['28/12', '2026-12-28', true],
    ['15/3', '2027-03-15', true],
    ['3/11/2026', '2026-11-03', false],
    ['28/12/25', '2025-12-28', false],
  ])('"%s" is %s (scheduled: %s)', (text, date, scheduled) => {
    expect(dateOf(text)).toMatchObject({ date, scheduled, description: 'pan' });
  });

  it('with a card, the last one that already passed', () => {
    expect(dateOf('visa 15/3')).toMatchObject({ date: '2026-03-15', scheduled: false });
    expect(dateOf('visa el 20').date).toBe('2026-10-20');
    expect(dateOf('visa 5/11').date).toBe('2026-11-05');
  });

  it('a card cannot be scheduled', () => {
    expect(error('pan 1200 visa mañana')).toBe('CARD_CANNOT_BE_SCHEDULED');
    expect(error('pan 1200 visa el próximo 20')).toBe('CARD_CANNOT_BE_SCHEDULED');
    expect(error('pan 1200 visa 28/12/2026')).toBe('CARD_CANNOT_BE_SCHEDULED');
  });

  it('dates that do not exist', () => {
    expect(error('pan 1200 31/2')).toBe('INVALID_DATE');
    expect(error('pan 1200 el 31 que viene')).toBe('INVALID_DATE');
    expect(error('pan 1200 32/1')).toBe('INVALID_DATE');
    expect(error('pan 1200 1/13')).toBe('INVALID_DATE');
    expect(error('pan 1200 29/2/2026')).toBe('INVALID_DATE');
  });

  it('29/2 is the next one that exists, or the past one with a card', () => {
    expect(draft('pan 1200 29/2/2028', { today: '2027-11-05' as LocalDate }).date).toBe(
      '2028-02-29',
    );
    // From 5/11/2026 the next 29/2 is in 2028: more than 12 months ahead.
    expect(error('pan 1200 29/2')).toBe('DATE_TOO_FAR');
    expect(dateOf('visa 29/2').date).toBe('2024-02-29');
    expect(draft('pan 1200 29/2', { today: '2028-01-10' as LocalDate }).date).toBe('2028-02-29');
  });

  it('up to 12 months ahead', () => {
    expect(dateOf('5/11/2027')).toMatchObject({ date: '2027-11-05', scheduled: true });
    expect(error('pan 1200 6/11/2027')).toBe('DATE_TOO_FAR');
  });

  it('"el 20" when today is the 5th asks; "el 31" in November is the 31st of October', () => {
    expect(error('pan 1200 el 20')).toBe('AMBIGUOUS_DATE');
    expect(dateOf('el 31').date).toBe('2026-10-31');
    expect(draft('pan 1200 el 31', { today: '2026-12-05' as LocalDate })).toMatchObject({
      date: '2026-12-31',
      scheduled: true,
    });
  });

  it('end of month and of the year', () => {
    const lastDay = { today: '2026-12-31' as LocalDate };
    expect(draft('pan 1200 mañana', lastDay).date).toBe('2027-01-01');
    expect(draft('pan 1200 el 31', lastDay).date).toBe('2026-12-31');
    expect(draft('pan 1200 el próximo 1', lastDay).date).toBe('2027-01-01');
    expect(draft('pan 1200 1/1', lastDay)).toMatchObject({ date: '2027-01-01', scheduled: true });
    const leap = { today: '2028-03-01' as LocalDate };
    expect(draft('pan 1200 ayer', leap).date).toBe('2028-02-29');
  });

  it('a day number followed by a multiplier is an amount, not a date', () => {
    expect(draft('pan el 20 mil')).toMatchObject({ amount: '20000.00', date: TODAY });
  });
});

describe('parseTextEntry: reason', () => {
  it('keeps what the person wrote, without fillers', () => {
    expect(draft('Café con Leche 3500').description).toBe('Café Leche');
    expect(draft('gasté en la Farmacia 3500').description).toBe('Farmacia');
  });

  it('empty when there is nothing but amount, source and date', () => {
    expect(draft('3500 mp hoy')).toMatchObject({ description: '', categoryId: null });
  });

  it('ignores trailing punctuation', () => {
    expect(draft('café, 3500.')).toMatchObject({ amount: '3500.00', description: 'café' });
  });
});

describe('parseTextEntry: category', () => {
  it('the user rules come first, then global rules, then a prefix', () => {
    expect(draft('ypf 30000').categoryId).toBe('cat-nafta');
    const mine = { rules: [{ pattern: 'ypf', categoryId: 'cat-salud' }] };
    expect(draft('ypf 30000', mine).categoryId).toBe('cat-salud');
    expect(draft('nafta 30000').categoryId).toBe('cat-nafta');
  });

  it('rules match whole words, accents and case ignored', () => {
    const gas = { rules: [{ pattern: 'gas', categoryId: 'cat-salud' }] };
    expect(draft('gaseosa 2000', gas).categoryId).toBeNull();
    expect(draft('GAS 2000', gas).categoryId).toBe('cat-salud');
    expect(draft('Café 2000').categoryId).toBe('cat-salidas');
  });

  it('the longest pattern wins', () => {
    const rules = {
      rules: [
        { pattern: 'coto', categoryId: 'cat-super' },
        { pattern: 'coto digital', categoryId: 'cat-salidas' },
      ],
    };
    expect(draft('coto digital 2000', rules).categoryId).toBe('cat-salidas');
    expect(draft('coto 2000', rules).categoryId).toBe('cat-super');
  });

  it('a pattern with fillers ("la anónima")', () => {
    expect(draft('La Anónima 9000')).toMatchObject({
      categoryId: 'cat-super',
      description: 'Anónima',
    });
  });

  it('a global rule needs a category with that name', () => {
    expect(draft('rappi 9000').categoryId).toBeNull();
  });

  it('rules of the other type are ignored', () => {
    const rules = { rules: [{ pattern: 'freelo', categoryId: 'cat-freelance' }] };
    expect(draft('freelo 9000', rules).categoryId).toBeNull();
    expect(draft('+ freelo 9000', rules).categoryId).toBe('cat-freelance');
  });

  it('a prefix with two candidates does not choose; short words are not compared', () => {
    expect(draft('comida 9000').categoryId).toBeNull();
    expect(draft('sal 9000').categoryId).toBeNull();
    expect(draft('salud 9000').categoryId).toBe('cat-salud');
  });
});

describe('normalization', () => {
  it('aliases have no spaces and patterns single spaces', () => {
    expect(normalizeAlias(' Mercado  Pago ')).toBe('mercadopago');
    expect(normalizePattern('  La   Anónima ')).toBe('la anonima');
  });

  it('there are 35 global rules', () => {
    expect(DEFAULT_MERCHANT_RULES).toHaveLength(35);
  });
});

describe('checkTextEntryDraft', () => {
  const data = {
    enabledCurrencies: ['ARS', 'USD'] as const,
    accounts: [
      {
        id: 'acc-mp',
        name: 'Mercado Pago',
        balances: [{ pocketId: 'p-mp-ars', currency: 'ARS' as const }],
      },
    ],
    cardIds: ['card-visa'],
  };

  it('resolves an account to its balance in the currency', () => {
    expect(checkTextEntryDraft(draft('pan 1200 mp'), data)).toEqual({
      ok: true,
      pocketId: 'p-mp-ars',
    });
  });

  it('rejects a currency that is not enabled and an account without a balance in it', () => {
    expect(checkTextEntryDraft(draft('pan 20 euros mp'), data)).toMatchObject({
      ok: false,
      error: 'CURRENCY_NOT_ENABLED',
      currency: 'EUR',
    });
    expect(checkTextEntryDraft(draft('pan 20 usd mp'), data)).toMatchObject({
      ok: false,
      error: 'NO_BALANCE_IN_CURRENCY',
      accountName: 'Mercado Pago',
      currency: 'USD',
    });
  });

  it('rejects a source that no longer exists', () => {
    expect(checkTextEntryDraft(draft('pan 1200 efe'), data)).toMatchObject({
      ok: false,
      error: 'SOURCE_NOT_FOUND',
    });
    expect(checkTextEntryDraft(draft('pan 1200 visa'), data)).toEqual({ ok: true, pocketId: null });
  });
});
