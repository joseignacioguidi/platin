import type { LocalDate } from '@platin/domain';
import { addDays, dateParts } from '@platin/domain';
import { parseQuotedArray, parseQuotedJson } from '../common/quoted-json';
import {
  CatalogItem,
  FetchedPrice,
  fetchText,
  PricedInstrument,
  type PriceProvider,
  StoredPrice,
} from './price-provider';

const HOUR_MS = 60 * 60_000;
/** The catalog: the first coins by market capitalization. */
const CATALOG_SIZE = 250;

/** GET /coins/markets: the catalog, always in dollars. */
export function parseMarkets(body: string): CatalogItem[] {
  return parseQuotedArray(body, [], 'CoinGecko').flatMap((item) => {
    const id = item['id'];
    const symbol = item['symbol'];
    const name = item['name'];
    return typeof id === 'string' && typeof symbol === 'string' && typeof name === 'string'
      ? [
          {
            externalId: id,
            symbol: symbol.toUpperCase(),
            name,
            type: 'CRYPTO' as const,
            currency: 'USD' as const,
          },
        ]
      : [];
  });
}

/** GET /simple/price?ids=…&vs_currencies=usd → { id: price }, prices as decimal strings. */
export function parseSimplePrice(body: string): Map<string, string> {
  const parsed = parseQuotedJson(body, ['usd']);
  const prices = new Map<string, string>();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return prices;
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    const usd = (value as Record<string, unknown> | null)?.['usd'];
    if (typeof usd === 'string' && /[1-9]/.test(usd)) prices.set(id, usd);
  }
  return prices;
}

/** GET /coins/{id}/history: market_data.current_price.usd as a decimal string. */
export function parseHistoryPrice(body: string): string | null {
  const parsed = parseQuotedJson(body, ['usd']) as {
    market_data?: { current_price?: { usd?: unknown } };
  } | null;
  const usd = parsed?.market_data?.current_price?.usd;
  return typeof usd === 'string' && /[1-9]/.test(usd) ? usd : null;
}

const ddmmyyyy = (day: LocalDate) => {
  const { year, month, day: d } = dateParts(day);
  return `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
};

/**
 * Crypto from CoinGecko, always in dollars: the catalog by market capitalization, the prices of
 * every linked coin in one request, and the history for the month-end valuation. The free (Demo)
 * key is optional: without it the requests per minute are fewer.
 */
export class CoinGeckoProvider implements PriceProvider {
  readonly source = 'COINGECKO' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly today: () => LocalDate,
    private readonly apiKey?: string,
  ) {}

  async catalog(): Promise<CatalogItem[]> {
    return parseMarkets(
      await this.get(
        `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${CATALOG_SIZE}&page=1`,
      ),
    );
  }

  async latest(instruments: readonly PricedInstrument[]): Promise<FetchedPrice[]> {
    if (instruments.length === 0) return [];
    const ids = [...new Set(instruments.map((i) => i.externalId))];
    const prices = parseSimplePrice(
      await this.get(`/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=usd`),
    );
    const day = this.today();
    return ids.flatMap((id) => {
      const price = prices.get(id);
      return price ? [{ externalId: id, date: day, price }] : [];
    });
  }

  /**
   * The price at the end of a day: CoinGecko's history is the price at 00:00 UTC of a date, so
   * the end of `date` is the next day's.
   */
  async at(instrument: PricedInstrument, date: LocalDate): Promise<FetchedPrice | null> {
    const price = parseHistoryPrice(
      await this.get(
        `/coins/${encodeURIComponent(instrument.externalId)}/history?date=${ddmmyyyy(addDays(date, 1))}&localization=false`,
      ),
    );
    return price ? { externalId: instrument.externalId, date, price } : null;
  }

  isStale(last: StoredPrice, now: Date): boolean {
    return now.getTime() - last.fetchedAt.getTime() > HOUR_MS;
  }

  private get(path: string): Promise<string> {
    return fetchText(
      `${this.baseUrl}${path}`,
      'CoinGecko',
      this.apiKey ? { 'x-cg-demo-api-key': this.apiKey } : {},
    );
  }
}
