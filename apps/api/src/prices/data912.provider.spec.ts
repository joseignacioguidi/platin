import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLocalDate } from '@platin/domain';
import {
  Data912Provider,
  marketDay,
  panelCatalog,
  parseHistory,
  parsePanel,
  tickerCurrency,
} from './data912.provider';
import type { PricedInstrument } from './price-provider';

/** Real answers of 2026-11-25 (a few rows of each panel). */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const CEDEARS = fixture('data912-cedears.json');
const STOCKS = fixture('data912-stocks.json');
const HISTORY = fixture('data912-history-AAPL.json');
const d = parseLocalDate;

describe('Data912 parsing', () => {
  const panel = new Map(parsePanel(CEDEARS).map((row) => [row.symbol, row]));
  const stocks = new Map(parsePanel(STOCKS).map((row) => [row.symbol, row]));

  it('keeps the last price as a string; an empty or zero price is null', () => {
    expect(panel.get('AAPL')?.last).toBe('31600');
    expect(panel.get('AAPLD')?.last).toBe('18.98');
    expect(panel.get('BMYC')?.last).toBeNull();
  });

  it('AAPL is in pesos, AAPLD in MEP dollars and AAPLC in cable dollars', () => {
    expect(tickerCurrency('AAPL', panel)).toBe('ARS');
    expect(tickerCurrency('AAPLD', panel)).toBe('USD');
    expect(tickerCurrency('AAPLC', panel)).toBe('USD');
  });

  it('real tickers that end in D stay in pesos (AMD, HD, GLD, BBD, YPFD)', () => {
    expect(tickerCurrency('AMD', panel)).toBe('ARS');
    expect(tickerCurrency('HD', panel)).toBe('ARS');
    expect(tickerCurrency('GLD', panel)).toBe('ARS');
    // BB exists, but BBD (Bradesco) is worth about the same: it is not BB in dollars.
    expect(tickerCurrency('BBD', panel)).toBe('ARS');
    expect(tickerCurrency('YPFD', stocks)).toBe('ARS');
    expect(tickerCurrency('YPFDD', stocks)).toBe('USD');
    expect(tickerCurrency('BMA.D', stocks)).toBe('USD');
    expect(tickerCurrency('GGALD', stocks)).toBe('USD');
  });

  it('the catalog names each version', () => {
    const catalog = panelCatalog('CEDEAR', parsePanel(CEDEARS));
    expect(catalog.find((c) => c.symbol === 'AAPL')).toEqual({
      externalId: 'AAPL',
      symbol: 'AAPL',
      name: 'AAPL · CEDEAR en pesos',
      type: 'CEDEAR',
      currency: 'ARS',
    });
    expect(catalog.find((c) => c.symbol === 'AAPLD')?.name).toBe('AAPL · CEDEAR en dólares MEP');
    expect(catalog.find((c) => c.symbol === 'AAPLC')?.name).toBe('AAPL · CEDEAR en dólares cable');
    expect(panelCatalog('STOCK', parsePanel(STOCKS)).find((c) => c.symbol === 'GGAL')?.name).toBe(
      'GGAL · Acción en pesos',
    );
  });

  it('history keeps the closing price of each day as a string', () => {
    expect(parseHistory(HISTORY).at(-1)).toEqual({ date: '2026-11-25', close: '31600' });
  });

  it('a live price on a weekend is from Friday', () => {
    expect(marketDay(d('2026-11-28'))).toBe('2026-11-27');
    expect(marketDay(d('2026-11-25'))).toBe('2026-11-25');
  });
});

describe('Data912Provider', () => {
  const urls: string[] = [];
  const aapl: PricedInstrument = {
    id: 'i1',
    source: 'DATA912',
    externalId: 'AAPL',
    symbol: 'AAPL',
    type: 'CEDEAR',
    currency: 'ARS',
    category: null,
  };
  const provider = new Data912Provider('https://d912.test', () => d('2026-11-25'));

  beforeEach(() => {
    urls.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/live/arg_cedears')) return new Response(CEDEARS);
      if (url.endsWith('/live/arg_stocks')) return new Response(STOCKS);
      if (url.endsWith('/historical/cedears/AAPL')) return new Response(HISTORY);
      return new Response('{"Error":"Nahh no tengo ese ticker loko"}');
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('latest asks each panel once and skips a ticker without price', async () => {
    const prices = await provider.latest([
      aapl,
      { ...aapl, id: 'i2', externalId: 'AAPLD', currency: 'USD' },
      { ...aapl, id: 'i3', externalId: 'BMYC', currency: 'USD' },
      { ...aapl, id: 'i4', externalId: 'GGAL', type: 'STOCK' },
    ]);
    expect(urls.sort()).toEqual(['https://d912.test/live/arg_cedears', 'https://d912.test/live/arg_stocks']);
    expect(prices).toEqual([
      { externalId: 'AAPL', date: '2026-11-25', price: '31600' },
      { externalId: 'AAPLD', date: '2026-11-25', price: '18.98' },
      { externalId: 'GGAL', date: '2026-11-25', price: '4747.5' },
    ]);
  });

  it('at a date takes the close of that day or the closest previous one', async () => {
    // 23/11 was a holiday (no row): the close of Friday 20/11.
    expect(await provider.at(aapl, d('2026-11-23'))).toEqual({
      externalId: 'AAPL',
      date: '2026-11-20',
      price: '30880',
    });
    expect(await provider.at(aapl, d('2026-11-24'))).toMatchObject({ price: '31920' });
    // A ticker without history (the dollar ones) gives nothing: the stored price is used.
    expect(await provider.at({ ...aapl, externalId: 'AAPLD' }, d('2026-11-23'))).toBeNull();
  });

  it('is stale after an hour', () => {
    const now = new Date('2026-11-25T15:00:00Z');
    expect(provider.isStale({ date: d('2026-11-25'), fetchedAt: new Date('2026-11-25T14:30:00Z') }, now)).toBe(false);
    expect(provider.isStale({ date: d('2026-11-25'), fetchedAt: new Date('2026-11-25T13:30:00Z') }, now)).toBe(true);
  });
});
