import type { Currency, LocalDate } from '@platin/domain';
import { addDays, compareDates, dateParts, isLocalDate, parseLocalDate } from '@platin/domain';
import { parseQuotedArray } from '../common/quoted-json';
import {
  CatalogItem,
  FetchedPrice,
  fetchText,
  PricedInstrument,
  type PriceProvider,
  StoredPrice,
} from './price-provider';

/**
 * The fund categories of ArgentinaDatos with a unit value ("vcp"). "otros" is left out: it lists
 * paid accounts (with a TNA), not funds.
 */
export const FCI_CATEGORIES = [
  'mercadoDinero',
  'rentaFija',
  'rentaVariable',
  'rentaMixta',
  'retornoTotal',
] as const;

/** A fund whose last value is older than this many business days was closed or merged. */
const MAX_BUSINESS_DAYS_OLD = 10;
/** How far back the history looks for a day with a value (weekends and holidays). */
const HISTORY_LOOKBACK_DAYS = 7;
const HOUR_MS = 60 * 60_000;

export interface FundRow {
  name: string;
  date: LocalDate;
  /** Unit value as a decimal string. */
  vcp: string;
}

/** Monday to Friday; holidays are not known, so they count as business days. */
export function isBusinessDay(day: LocalDate): boolean {
  const { year, month, day: d } = dateParts(day);
  const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function previousBusinessDay(day: LocalDate): LocalDate {
  let current = addDays(day, -1);
  while (!isBusinessDay(current)) current = addDays(current, -1);
  return current;
}

/** Business days from `from` (exclusive) to `to` (inclusive). */
export function businessDaysBetween(from: LocalDate, to: LocalDate): number {
  let count = 0;
  for (let day = addDays(from, 1); compareDates(day, to) <= 0; day = addDays(day, 1)) {
    if (isBusinessDay(day)) count += 1;
  }
  return count;
}

/**
 * ArgentinaDatos does not say a fund's currency: it comes from its name ("Dólares", "U$S",
 * "USD", "Dollar"). Everything else is in pesos (ADR 0041).
 */
export function fundCurrency(name: string): Currency {
  return /d[oó]lar|u\$s|\busd\b|\bus\$|dollar/i.test(name) ? 'USD' : 'ARS';
}

/** "Super Ahorro $ - Clase A" → "Super Ahorro $": what the list shows big, with the class below. */
export function fundSymbol(name: string): string {
  return name.split(' - ')[0].trim();
}

/** Parses one category's list keeping vcp as a string; rows without a value are dropped. */
export function parseFunds(body: string): FundRow[] {
  const rows: FundRow[] = [];
  for (const item of parseQuotedArray(body, ['vcp'], 'ArgentinaDatos')) {
    const name = typeof item['fondo'] === 'string' ? item['fondo'].trim() : '';
    const date = item['fecha'];
    const vcp = item['vcp'];
    if (!name || typeof date !== 'string' || !isLocalDate(date) || typeof vcp !== 'string')
      continue;
    if (!/^\d+(\.\d+)?$/.test(vcp) || /^0+(\.0+)?$/.test(vcp)) continue;
    rows.push({ name, date: parseLocalDate(date), vcp });
  }
  return rows;
}

/**
 * The catalog from every category: one instrument per fund class, the newest row when a name
 * repeats, and without the funds that stopped reporting (ADR 0040).
 */
export function fundsCatalog(
  byCategory: readonly { category: string; rows: readonly FundRow[] }[],
  today: LocalDate,
): CatalogItem[] {
  const newest = new Map<string, { category: string; row: FundRow }>();
  for (const { category, rows } of byCategory) {
    for (const row of rows) {
      const current = newest.get(row.name);
      if (!current || compareDates(row.date, current.row.date) > 0) {
        newest.set(row.name, { category, row });
      }
    }
  }
  return [...newest.values()]
    .filter(({ row }) => businessDaysBetween(row.date, today) <= MAX_BUSINESS_DAYS_OLD)
    .map(({ category, row }) => ({
      externalId: row.name,
      symbol: fundSymbol(row.name),
      name: row.name,
      type: 'MUTUAL_FUND' as const,
      currency: fundCurrency(row.name),
      category,
    }));
}

/**
 * Mutual funds (FCI) from ArgentinaDatos: the daily unit value of every fund reported to the
 * CAFCI, by category (GET /v1/finanzas/fci/{categoria}/ultimo), and a category on a past date
 * (GET /v1/finanzas/fci/{categoria}/{AAAA}/{MM}/{DD}) for the month-end valuation.
 */
export class ArgentinaDatosProvider implements PriceProvider {
  readonly source = 'ARGENTINADATOS' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly today: () => LocalDate,
  ) {}

  async catalog(): Promise<CatalogItem[]> {
    const lists = await Promise.all(
      FCI_CATEGORIES.map(async (category) => ({ category, rows: await this.latestOf(category) })),
    );
    return fundsCatalog(lists, this.today());
  }

  async latest(instruments: readonly PricedInstrument[]): Promise<FetchedPrice[]> {
    const categories = new Set(instruments.map((i) => i.category ?? 'mercadoDinero'));
    const wanted = new Set(instruments.map((i) => i.externalId));
    // One request per category; a failing category only leaves its funds without a new price.
    const results = await Promise.allSettled([...categories].map((c) => this.latestOf(c)));
    const prices: FetchedPrice[] = [];
    let failures = 0;
    for (const result of results) {
      if (result.status === 'rejected') {
        failures += 1;
        continue;
      }
      for (const row of result.value) {
        if (wanted.has(row.name))
          prices.push({ externalId: row.name, date: row.date, price: row.vcp });
      }
    }
    if (failures === results.length && results.length > 0) {
      throw (results[0] as PromiseRejectedResult).reason;
    }
    return prices;
  }

  async at(instrument: PricedInstrument, date: LocalDate): Promise<FetchedPrice | null> {
    const category = instrument.category ?? 'mercadoDinero';
    for (let back = 0; back < HISTORY_LOOKBACK_DAYS; back += 1) {
      const day = addDays(date, -back);
      if (!isBusinessDay(day)) continue;
      const { year, month, day: d } = dateParts(day);
      const path = `/v1/finanzas/fci/${category}/${year}/${pad(month)}/${pad(d)}`;
      const rows = parseFunds(await fetchText(`${this.baseUrl}${path}`, 'ArgentinaDatos'));
      const row = rows.find((r) => r.name === instrument.externalId);
      if (row) return { externalId: row.name, date: row.date, price: row.vcp };
    }
    return null;
  }

  /**
   * One value per business day, published the day after: asked again when the stored one is
   * older than the previous business day, at most once an hour.
   */
  isStale(last: StoredPrice, now: Date, today: LocalDate): boolean {
    return (
      compareDates(last.date, previousBusinessDay(today)) < 0 &&
      now.getTime() - last.fetchedAt.getTime() > HOUR_MS
    );
  }

  private async latestOf(category: string): Promise<FundRow[]> {
    return parseFunds(
      await fetchText(`${this.baseUrl}/v1/finanzas/fci/${category}/ultimo`, 'ArgentinaDatos'),
    );
  }
}

const pad = (value: number) => String(value).padStart(2, '0');
