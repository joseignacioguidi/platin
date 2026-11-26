import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLocalDate } from '@platin/domain';
import {
  ArgentinaDatosProvider,
  businessDaysBetween,
  fundCurrency,
  fundsCatalog,
  fundSymbol,
  parseFunds,
  previousBusinessDay,
} from './argentinadatos.provider';
import type { PricedInstrument } from './price-provider';

/** Real answers of 2026-11-25 (a few rows of each category). */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const MERCADO_DINERO = fixture('argentinadatos-mercadoDinero.json');
const RENTA_FIJA = fixture('argentinadatos-rentaFija.json');
const d = parseLocalDate;

describe('ArgentinaDatos parsing', () => {
  it('keeps the unit value as a string with all its decimals', () => {
    const rows = parseFunds(MERCADO_DINERO);
    expect(rows.find((r) => r.name === 'Super Ahorro $ - Clase A')).toEqual({
      name: 'Super Ahorro $ - Clase A',
      date: '2026-11-24',
      vcp: '20654.68',
    });
    expect(rows.find((r) => r.name === '1810 Ahorro')?.vcp).toBe('247177.939');
  });

  it('drops rows without a value or with zero', () => {
    const body =
      '[{"fondo":"A","fecha":"2026-11-24","vcp":null},{"fondo":"B","fecha":"2026-11-24","vcp":0},{"fondo":"C","fecha":"2026-11-24","vcp":1.5}]';
    expect(parseFunds(body).map((r) => r.name)).toEqual(['C']);
  });

  it('the currency comes from the name; the symbol is the fund without its class', () => {
    expect(fundCurrency('Super Ahorro $ - Clase A')).toBe('ARS');
    expect(fundCurrency('Super Ahorro U$S - Clase A ex Letes')).toBe('USD');
    expect(fundCurrency('Superfondo Ahorro en Dólares - Clase A')).toBe('USD');
    expect(fundCurrency('Allaria Dólar Ahorro - Clase A')).toBe('USD');
    expect(fundCurrency('1810 Ahorro')).toBe('ARS');
    expect(fundSymbol('Super Ahorro $ - Clase A')).toBe('Super Ahorro $');
    expect(fundSymbol('1810 Ahorro')).toBe('1810 Ahorro');
  });

  it('business days skip weekends', () => {
    // 2026-11-23 is a Monday.
    expect(previousBusinessDay(d('2026-11-23'))).toBe('2026-11-20');
    expect(previousBusinessDay(d('2026-11-25'))).toBe('2026-11-24');
    expect(businessDaysBetween(d('2026-11-20'), d('2026-11-24'))).toBe(2);
  });
});

describe('fundsCatalog', () => {
  const catalog = fundsCatalog(
    [
      { category: 'mercadoDinero', rows: parseFunds(MERCADO_DINERO) },
      { category: 'rentaFija', rows: parseFunds(RENTA_FIJA) },
    ],
    d('2026-11-25'),
  );

  it('has every class of Super Ahorro $ with its currency and category', () => {
    expect(catalog).toContainEqual({
      externalId: 'Super Ahorro $ - Clase A',
      symbol: 'Super Ahorro $',
      name: 'Super Ahorro $ - Clase A',
      type: 'MUTUAL_FUND',
      currency: 'ARS',
      category: 'mercadoDinero',
    });
    expect(
      catalog.find((c) => c.externalId === 'Super Ahorro U$S - Clase A ex Letes')?.currency,
    ).toBe('USD');
  });

  it('leaves out the funds that stopped reporting (Superfondo 2000, a Latam class from March)', () => {
    const names = catalog.map((c) => c.externalId);
    expect(names).not.toContain('Superfondo 2000');
    expect(names).not.toContain('Superfondo Renta Fija Latam - Clase A');
    expect(names).toContain('Superfondo Renta $ - Clase A');
  });

  it('a name in two categories is one instrument, from the newest row', () => {
    const repeated = fundsCatalog(
      [
        { category: 'mercadoDinero', rows: [{ name: 'X', date: d('2026-11-10'), vcp: '1' }] },
        { category: 'rentaFija', rows: [{ name: 'X', date: d('2026-11-24'), vcp: '2' }] },
      ],
      d('2026-11-25'),
    );
    expect(repeated).toHaveLength(1);
    expect(repeated[0].category).toBe('rentaFija');
  });
});

describe('ArgentinaDatosProvider', () => {
  const instrument: PricedInstrument = {
    id: 'i1',
    source: 'ARGENTINADATOS',
    externalId: 'Super Ahorro $ - Clase A',
    symbol: 'Super Ahorro $',
    type: 'MUTUAL_FUND',
    currency: 'ARS',
    category: 'mercadoDinero',
  };
  const urls: string[] = [];

  beforeEach(() => {
    urls.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/mercadoDinero/ultimo')) return new Response(MERCADO_DINERO);
      if (url.endsWith('/mercadoDinero/2026/11/30')) return new Response('[]');
      if (url.endsWith('/mercadoDinero/2026/11/29')) return new Response('[]');
      if (url.endsWith('/mercadoDinero/2026/11/27'))
        return new Response(MERCADO_DINERO.replaceAll('2026-11-24', '2026-11-27'));
      return new Response('[]', { status: 500 });
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const provider = new ArgentinaDatosProvider('https://ad.test', () => d('2026-11-25'));

  it('latest asks once per category and returns only the wanted funds', async () => {
    const prices = await provider.latest([
      instrument,
      { ...instrument, id: 'i2', externalId: 'Super Ahorro $ - Clase B' },
    ]);
    expect(urls).toEqual(['https://ad.test/v1/finanzas/fci/mercadoDinero/ultimo']);
    expect(prices).toEqual([
      { externalId: 'Super Ahorro $ - Clase A', date: '2026-11-24', price: '20654.68' },
      { externalId: 'Super Ahorro $ - Clase B', date: '2026-11-24', price: '25128.158' },
    ]);
  });

  it('a failing source is an error, so its funds stay stale', async () => {
    await expect(provider.latest([{ ...instrument, category: 'rentaFija' }])).rejects.toThrow(
      'ArgentinaDatos answered 500',
    );
  });

  it('at a date goes back over weekends to the closest previous value', async () => {
    // 2026-11-30 is a Monday without a value yet; the 28th and 29th are a weekend.
    const price = await provider.at(instrument, d('2026-11-30'));
    expect(price).toEqual({
      externalId: 'Super Ahorro $ - Clase A',
      date: '2026-11-27',
      price: '20654.68',
    });
    expect(urls).toEqual([
      'https://ad.test/v1/finanzas/fci/mercadoDinero/2026/11/30',
      'https://ad.test/v1/finanzas/fci/mercadoDinero/2026/11/27',
    ]);
  });

  it('is stale when the stored value is older than the previous business day, once an hour', () => {
    const now = new Date('2026-11-25T15:00:00Z');
    const today = d('2026-11-25');
    expect(
      provider.isStale(
        { date: d('2026-11-24'), fetchedAt: new Date('2026-11-25T10:00:00Z') },
        now,
        today,
      ),
    ).toBe(false);
    expect(
      provider.isStale(
        { date: d('2026-11-21'), fetchedAt: new Date('2026-11-25T10:00:00Z') },
        now,
        today,
      ),
    ).toBe(true);
    expect(
      provider.isStale(
        { date: d('2026-11-21'), fetchedAt: new Date('2026-11-25T14:30:00Z') },
        now,
        today,
      ),
    ).toBe(false);
  });
});
