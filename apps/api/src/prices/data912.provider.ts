import type { Currency, LocalDate } from '@platin/domain';
import { compareDates, Decimal, isLocalDate, parseLocalDate } from '@platin/domain';
import { parseQuotedArray, parseQuotedJson } from '../common/quoted-json';
import type { InstrumentType } from '../generated/prisma/client';
import { isBusinessDay, previousBusinessDay } from './argentinadatos.provider';
import {
  CatalogItem,
  FetchedPrice,
  fetchText,
  PricedInstrument,
  type PriceProvider,
  StoredPrice,
} from './price-provider';

const HOUR_MS = 60 * 60_000;
/** A dollar version is worth around a thousandth of the peso one; never more than 1/100. */
const DOLLAR_RATIO = 100;

/** The two panels: CEDEARs and Argentine stocks. */
const PANELS: Record<'CEDEAR' | 'STOCK', { live: string; history: string; label: string }> = {
  CEDEAR: { live: '/live/arg_cedears', history: '/historical/cedears', label: 'CEDEAR' },
  STOCK: { live: '/live/arg_stocks', history: '/historical/stocks', label: 'Acción' },
};

export interface PanelRow {
  symbol: string;
  /** Last traded price as a decimal string, or null when it came empty or zero. */
  last: string | null;
}

/** Parses a panel keeping the last price ("c") as a string. */
export function parsePanel(body: string): PanelRow[] {
  return parseQuotedArray(body, ['c'], 'Data912').flatMap((item) => {
    const symbol = typeof item['symbol'] === 'string' ? item['symbol'].trim() : '';
    if (!symbol) return [];
    const c = item['c'];
    const last = typeof c === 'string' && /[1-9]/.test(c) && !c.startsWith('-') ? c : null;
    return [{ symbol, last }];
  });
}

/** "AAPLD" → "AAPL", "BMA.D" → "BMA", "AAPLC" → "AAPL". */
const baseOf = (symbol: string) => symbol.replace(/\.?[DC]$/, '');

/**
 * The currency of a ticker. Data912 lists each CEDEAR or stock in pesos (AAPL), in MEP dollars
 * (AAPLD) and in cable dollars (AAPLC), and does not say which is which. A ticker ending in D or
 * C is a dollar version only when the one without the letter is also in the panel and is worth
 * at least a hundred times more, because real tickers also end in D (AMD, HD, BBD, YPFD).
 * Without prices to compare, the base being there decides (ADR 0041).
 */
export function tickerCurrency(symbol: string, panel: ReadonlyMap<string, PanelRow>): Currency {
  const base = baseOf(symbol);
  if (base === symbol) return 'ARS';
  const baseRow = panel.get(base);
  if (!baseRow) return 'ARS';
  const row = panel.get(symbol);
  if (!row?.last || !baseRow.last) return 'USD';
  return new Decimal(row.last).times(DOLLAR_RATIO).lessThan(baseRow.last) ? 'USD' : 'ARS';
}

function displayName(symbol: string, label: string, currency: Currency) {
  if (currency === 'ARS') return `${symbol} · ${label} en pesos`;
  const cable = symbol.endsWith('C');
  return `${baseOf(symbol)} · ${label} en dólares ${cable ? 'cable' : 'MEP'}`;
}

/** The catalog of one panel: every ticker with its currency and a readable name. */
export function panelCatalog(type: 'CEDEAR' | 'STOCK', rows: readonly PanelRow[]): CatalogItem[] {
  const panel = new Map(rows.map((row) => [row.symbol, row]));
  return rows.map((row) => {
    const currency = tickerCurrency(row.symbol, panel);
    return {
      externalId: row.symbol,
      symbol: row.symbol,
      name: displayName(row.symbol, PANELS[type].label, currency),
      type: type as InstrumentType,
      currency,
    };
  });
}

/** The day a live price is from: today, or the last business day on a weekend. */
export function marketDay(today: LocalDate): LocalDate {
  return isBusinessDay(today) ? today : previousBusinessDay(today);
}

/** Parses a ticker's history: [{ date, c }] with the closing price as a string. */
export function parseHistory(body: string): { date: LocalDate; close: string }[] {
  const parsed = parseQuotedJson(body, ['c']);
  if (!Array.isArray(parsed)) return [];
  return (parsed as Record<string, unknown>[]).flatMap((item) => {
    const date = item['date'];
    const close = item['c'];
    return typeof date === 'string' &&
      isLocalDate(date) &&
      typeof close === 'string' &&
      /[1-9]/.test(close)
      ? [{ date: parseLocalDate(date), close }]
      : [];
  });
}

/**
 * CEDEARs and Argentine stocks from Data912 (a hobby project, with prices cached about two
 * hours): one request per panel, the last traded price of each ticker, and the daily history of
 * a ticker for the month-end valuation. Only the peso tickers have history.
 */
export class Data912Provider implements PriceProvider {
  readonly source = 'DATA912' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly today: () => LocalDate,
  ) {}

  async catalog(): Promise<CatalogItem[]> {
    const [cedears, stocks] = await Promise.all([this.panel('CEDEAR'), this.panel('STOCK')]);
    return [...panelCatalog('CEDEAR', cedears), ...panelCatalog('STOCK', stocks)];
  }

  async latest(instruments: readonly PricedInstrument[]): Promise<FetchedPrice[]> {
    const types = [...new Set(instruments.map((i) => (i.type === 'STOCK' ? 'STOCK' : 'CEDEAR')))];
    const wanted = new Set(instruments.map((i) => i.externalId));
    const day = marketDay(this.today());
    const panels = await Promise.all(types.map((type) => this.panel(type)));
    // A ticker without a price this time (empty or zero) keeps its last one.
    return panels
      .flat()
      .flatMap((row) =>
        wanted.has(row.symbol) && row.last
          ? [{ externalId: row.symbol, date: day, price: row.last }]
          : [],
      );
  }

  async at(instrument: PricedInstrument, date: LocalDate): Promise<FetchedPrice | null> {
    const panel = PANELS[instrument.type === 'STOCK' ? 'STOCK' : 'CEDEAR'];
    const body = await fetchText(
      `${this.baseUrl}${panel.history}/${encodeURIComponent(instrument.externalId)}`,
      'Data912',
    );
    const closes = parseHistory(body).filter((row) => compareDates(row.date, date) <= 0);
    const last = closes.reduce<(typeof closes)[number] | null>(
      (best, row) => (!best || compareDates(row.date, best.date) > 0 ? row : best),
      null,
    );
    return last ? { externalId: instrument.externalId, date: last.date, price: last.close } : null;
  }

  /** More than an hour old (the source itself caches about two). */
  isStale(last: StoredPrice, now: Date): boolean {
    return now.getTime() - last.fetchedAt.getTime() > HOUR_MS;
  }

  private async panel(type: 'CEDEAR' | 'STOCK'): Promise<PanelRow[]> {
    return parsePanel(await fetchText(`${this.baseUrl}${PANELS[type].live}`, 'Data912'));
  }
}
