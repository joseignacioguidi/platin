import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLocalDate } from '@platin/domain';
import {
  CoinGeckoProvider,
  parseHistoryPrice,
  parseMarkets,
  parseSimplePrice,
} from './coingecko.provider';
import type { PricedInstrument } from './price-provider';

/** Real answers of 2026-11-25. */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const MARKETS = fixture('coingecko-markets.json');
const SIMPLE = fixture('coingecko-simple-price.json');
const HISTORY = fixture('coingecko-history-bitcoin.json');
const d = parseLocalDate;

describe('CoinGecko parsing', () => {
  it('the catalog is in dollars with the symbol in capitals', () => {
    expect(parseMarkets(MARKETS)[0]).toEqual({
      externalId: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'CRYPTO',
      currency: 'USD',
    });
  });

  it('prices are decimal strings, also the tiny ones written with an exponent', () => {
    const prices = parseSimplePrice(SIMPLE);
    expect(prices.get('bitcoin')).toBe('60858');
    expect(prices.get('tether')).toBe('0.998897');
    expect(prices.get('shiba-inu')).toBe('0.00000365');
  });

  it('history reads market_data.current_price.usd', () => {
    expect(parseHistoryPrice(HISTORY)).toMatch(/^\d+\.\d+$/);
    expect(parseHistoryPrice('{"id":"x"}')).toBeNull();
  });
});

describe('CoinGeckoProvider', () => {
  const btc: PricedInstrument = {
    id: 'i1',
    source: 'COINGECKO',
    externalId: 'bitcoin',
    symbol: 'BTC',
    type: 'CRYPTO',
    currency: 'USD',
    category: null,
  };
  const calls: { url: string; headers: Record<string, string> }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.includes('/simple/price')) return new Response(SIMPLE);
      if (url.includes('/history')) return new Response(HISTORY);
      return new Response(MARKETS);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('every coin in one request, with the optional key', async () => {
    const provider = new CoinGeckoProvider('https://cg.test', () => d('2026-11-25'), 'demo-key');
    const prices = await provider.latest([btc, { ...btc, id: 'i2', externalId: 'tether' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://cg.test/simple/price?ids=bitcoin,tether&vs_currencies=usd');
    expect(calls[0].headers['x-cg-demo-api-key']).toBe('demo-key');
    expect(prices).toEqual([
      { externalId: 'bitcoin', date: '2026-11-25', price: '60858' },
      { externalId: 'tether', date: '2026-11-25', price: '0.998897' },
    ]);
  });

  it('the end of 30/11 is the price at 00:00 UTC of 01/12', async () => {
    const provider = new CoinGeckoProvider('https://cg.test', () => d('2026-12-01'));
    const price = await provider.at(btc, d('2026-11-30'));
    expect(calls[0].url).toBe(
      'https://cg.test/coins/bitcoin/history?date=01-12-2026&localization=false',
    );
    expect(calls[0].headers['x-cg-demo-api-key']).toBeUndefined();
    expect(price).toMatchObject({ externalId: 'bitcoin', date: '2026-11-30' });
  });
});
