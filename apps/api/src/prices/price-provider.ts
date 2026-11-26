import type { Currency, LocalDate } from '@platin/domain';
import type { InstrumentType, PriceSource } from '../generated/prisma/client';

/** One instrument as a source lists it, for the shared catalog. */
export interface CatalogItem {
  externalId: string;
  symbol: string;
  name: string;
  type: InstrumentType;
  currency: Currency;
  /** ArgentinaDatos fund category, to ask for its prices by category. */
  category?: string | null;
}

/** A price as a decimal string (never parsed as a float), in the instrument's currency. */
export interface FetchedPrice {
  externalId: string;
  date: LocalDate;
  price: string;
}

/** What a provider needs to know about an instrument to price it. */
export interface PricedInstrument {
  id: string;
  source: PriceSource;
  externalId: string;
  symbol: string;
  type: InstrumentType;
  currency: Currency;
  category: string | null;
}

/** The last stored price of an instrument, to decide whether to ask again. */
export interface StoredPrice {
  date: LocalDate;
  fetchedAt: Date;
}

/**
 * A source of instrument prices (ADR 0040), as RateProvider is of exchange rates. Each one asks
 * for whole lists (a panel, a fund category, several coins at once), never one by one. Tests
 * replace them with fakes (PRICE_PROVIDERS).
 */
export interface PriceProvider {
  readonly source: PriceSource;
  /** The full list for the catalog (once a day). */
  catalog(): Promise<CatalogItem[]>;
  /** The last prices of the given instruments, in as few requests as possible. */
  latest(instruments: readonly PricedInstrument[]): Promise<FetchedPrice[]>;
  /** The closing price on a date or the closest previous one, for the month-end valuation. */
  at(instrument: PricedInstrument, date: LocalDate): Promise<FetchedPrice | null>;
  /** Whether a stored price is old enough to ask again ("Precios de inversiones"). */
  isStale(last: StoredPrice, now: Date, today: LocalDate): boolean;
}

export const PRICE_PROVIDERS = Symbol('PRICE_PROVIDERS');

/** Every request to a source gives up after this long, as the rates do. */
export const PRICE_TIMEOUT_MS = 5000;

/** GET a URL as text with the shared timeout; a non-2xx answer is an error. */
export async function fetchText(
  url: string,
  source: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
    headers: { accept: 'application/json', ...headers },
  });
  if (!response.ok) throw new Error(`${source} answered ${response.status}`);
  return response.text();
}
