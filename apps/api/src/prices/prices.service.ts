import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Listing } from '@platin/contracts';
import { compareDates, Decimal, LocalDate } from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { date, rate, toDbDate } from '../common/serialize';
import type { InstrumentType, PriceSource } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogItem,
  FetchedPrice,
  PRICE_PROVIDERS,
  PricedInstrument,
  type PriceProvider,
} from './price-provider';

/** Which source prices each instrument type ("Precios de inversiones"). */
export const SOURCE_BY_TYPE: Partial<Record<InstrumentType, PriceSource>> = {
  CEDEAR: 'DATA912',
  STOCK: 'DATA912',
  MUTUAL_FUND: 'ARGENTINADATOS',
  CRYPTO: 'COINGECKO',
};

const SEARCH_LIMIT = 20;

export interface LatestPrice {
  price: string;
  date: LocalDate;
  /** It could not be refreshed: it is the last one stored. */
  stale: boolean;
}

/** Lowercase and without accents, to search "super ahorro" or "acción" either way. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

const toListing = (row: {
  id: string;
  symbol: string;
  name: string;
  type: InstrumentType;
  currency: Listing['currency'];
}): Listing => ({
  id: row.id,
  symbol: row.symbol,
  name: row.name,
  type: row.type,
  currency: row.currency,
});

/**
 * The shared catalog of instruments and their prices (ADR 0040): searched, cached and fetched
 * from the providers lazily, like the exchange rates, without a cron. A failing source never
 * breaks a read: its instruments keep their last stored price, marked stale.
 */
@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  /** The day each source's catalog was last downloaded (once a day per process). */
  private readonly catalogDay = new Map<PriceSource, LocalDate>();
  private readonly catalogInFlight = new Map<PriceSource, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    @Inject(PRICE_PROVIDERS) private readonly providers: PriceProvider[],
  ) {}

  provider(source: PriceSource): PriceProvider | undefined {
    return this.providers.find((provider) => provider.source === source);
  }

  /** The instrument types with an enabled source: the ones that can be linked. */
  pricedTypes(): InstrumentType[] {
    return (Object.keys(SOURCE_BY_TYPE) as InstrumentType[]).filter((type) => {
      const source = SOURCE_BY_TYPE[type];
      return source !== undefined && this.provider(source) !== undefined;
    });
  }

  /** INV-07: active instruments of a type by symbol or name, ignoring case and accents. */
  async search(type: InstrumentType, query: string): Promise<Listing[]> {
    const source = SOURCE_BY_TYPE[type];
    if (!source || !this.provider(source)) return [];
    await this.refreshCatalog(source);
    const rows = await this.prisma.instrument.findMany({
      where: { type, active: true },
      select: { id: true, symbol: true, name: true, type: true, currency: true },
      orderBy: [{ symbol: 'asc' }, { name: 'asc' }],
    });
    const q = normalizeSearch(query);
    if (!q) return rows.slice(0, SEARCH_LIMIT).map(toListing);
    const words = q.split(/\s+/);
    const scored = rows
      .map((row) => {
        const symbol = normalizeSearch(row.symbol);
        const text = `${symbol} ${normalizeSearch(row.name)}`;
        if (!words.every((word) => text.includes(word))) return null;
        // An exact symbol first ("AAPL" before "AAPLD"), then symbols that start with it.
        const score = symbol === q ? 0 : symbol.startsWith(q) ? 1 : 2;
        return { row, score };
      })
      .filter((item): item is { row: (typeof rows)[number]; score: number } => item !== null)
      .sort((a, b) => a.score - b.score);
    return scored.slice(0, SEARCH_LIMIT).map((item) => toListing(item.row));
  }

  /** Downloads a source's catalog once a day; a failure keeps the stored one. */
  async refreshCatalog(source: PriceSource): Promise<void> {
    if (
      this.catalogDay.get(source) === this.clock.today() &&
      (await this.prisma.instrument.count({ where: { source } })) > 0
    ) {
      return;
    }
    let pending = this.catalogInFlight.get(source);
    if (!pending) {
      pending = this.downloadCatalog(source).finally(() => this.catalogInFlight.delete(source));
      this.catalogInFlight.set(source, pending);
    }
    return pending;
  }

  private async downloadCatalog(source: PriceSource): Promise<void> {
    const provider = this.provider(source);
    if (!provider) return;
    let items: CatalogItem[];
    try {
      items = await provider.catalog();
    } catch (error) {
      this.logger.warn(`Catalog of ${source} failed: ${(error as Error).message}`);
      return;
    }
    if (items.length === 0) return;
    await this.storeCatalog(source, items);
    this.catalogDay.set(source, this.clock.today());
  }

  /**
   * Upserts a catalog: new instruments are created, changed ones updated, and the ones that did
   * not come are deactivated unless a pocket is linked to them.
   */
  async storeCatalog(source: PriceSource, items: readonly CatalogItem[]): Promise<void> {
    const unique = new Map(items.map((item) => [item.externalId, item]));
    const existing = await this.prisma.instrument.findMany({ where: { source } });
    const byExternal = new Map(existing.map((row) => [row.externalId, row]));
    const created = [...unique.values()].filter((item) => !byExternal.has(item.externalId));
    if (created.length > 0) {
      await this.prisma.instrument.createMany({
        data: created.map((item) => ({ source, ...item, category: item.category ?? null })),
        skipDuplicates: true,
      });
    }
    for (const row of existing) {
      const item = unique.get(row.externalId);
      if (item) {
        const category = item.category ?? null;
        if (
          row.symbol !== item.symbol ||
          row.name !== item.name ||
          row.type !== item.type ||
          row.currency !== item.currency ||
          row.category !== category ||
          !row.active
        ) {
          await this.prisma.instrument.update({
            where: { id: row.id },
            data: { ...item, category, active: true },
          });
        }
      }
    }
    await this.prisma.instrument.updateMany({
      where: {
        source,
        active: true,
        externalId: { notIn: [...unique.keys()] },
        holdings: { none: {} },
      },
      data: { active: false },
    });
  }

  /**
   * INV-08: the last price of each instrument, asking the sources first for the ones whose price
   * is old. Sources are independent: one failing marks only its instruments as stale.
   */
  async latest(instrumentIds: readonly string[]): Promise<Map<string, LatestPrice>> {
    const ids = [...new Set(instrumentIds)];
    const result = new Map<string, LatestPrice>();
    if (ids.length === 0) return result;
    const instruments = await this.prisma.instrument.findMany({ where: { id: { in: ids } } });
    const stored = await this.lastStored(ids);
    const now = this.clock.now();
    const today = this.clock.today();
    const failed = new Set<string>();

    const bySource = new Map<PriceSource, PricedInstrument[]>();
    for (const instrument of instruments) {
      const provider = this.provider(instrument.source);
      const last = stored.get(instrument.id);
      if (!provider) {
        failed.add(instrument.id);
        continue;
      }
      if (last && !provider.isStale({ date: last.date, fetchedAt: last.fetchedAt }, now, today)) {
        continue;
      }
      bySource.set(instrument.source, [...(bySource.get(instrument.source) ?? []), instrument]);
    }

    const outcomes = await Promise.allSettled(
      [...bySource.entries()].map(async ([source, list]) => {
        const prices = await (this.provider(source) as PriceProvider).latest(list);
        await this.storePrices(list, prices);
        // An instrument the source did not price this time keeps its last price, stale.
        const priced = new Set(prices.map((p) => p.externalId));
        for (const instrument of list)
          if (!priced.has(instrument.externalId)) failed.add(instrument.id);
      }),
    );
    [...bySource.entries()].forEach(([source, list], index) => {
      const outcome = outcomes[index];
      if (outcome.status === 'rejected') {
        this.logger.warn(`Prices of ${source} failed: ${(outcome.reason as Error).message}`);
        for (const instrument of list) failed.add(instrument.id);
      }
    });

    const fresh = bySource.size > 0 ? await this.lastStored(ids) : stored;
    for (const [id, last] of fresh) {
      result.set(id, { price: last.price, date: last.date, stale: failed.has(id) });
    }
    return result;
  }

  /**
   * INV-11: the price on a date or the closest previous one. The stored one is used when it is
   * of that very date; otherwise the source's history is asked, and the stored one is the
   * fallback.
   */
  async priceAt(
    instrumentId: string,
    day: LocalDate,
  ): Promise<{ price: string; date: LocalDate } | null> {
    const find = () =>
      this.prisma.instrumentPrice.findFirst({
        where: { instrumentId, date: { lte: toDbDate(day) } },
        orderBy: { date: 'desc' },
      });
    const row = await find();
    if (row && compareDates(date(row.date), day) === 0) {
      return { price: rate(row.price), date: day };
    }
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    const provider = instrument && this.provider(instrument.source);
    if (instrument && provider) {
      try {
        const fetched = await provider.at(instrument, day);
        if (fetched && compareDates(fetched.date, day) <= 0) {
          await this.storePrices([instrument], [fetched]);
          const best = await find();
          if (best) return { price: rate(best.price), date: date(best.date) };
        }
      } catch (error) {
        this.logger.warn(`History of ${instrument.source} failed: ${(error as Error).message}`);
      }
    }
    return row ? { price: rate(row.price), date: date(row.date) } : null;
  }

  /** Saves prices by (instrument, date); a price of zero or less is ignored. */
  async storePrices(
    instruments: readonly PricedInstrument[],
    prices: readonly FetchedPrice[],
  ): Promise<void> {
    const byExternal = new Map(instruments.map((i) => [i.externalId, i.id]));
    const fetchedAt = this.clock.now();
    for (const fetched of prices) {
      const instrumentId = byExternal.get(fetched.externalId);
      if (!instrumentId || !/^\d+(\.\d+)?$/.test(fetched.price)) continue;
      // Six decimals, like the column (cuotapartes and small coins have more).
      const price = new Decimal(fetched.price).toFixed(6);
      if (!new Decimal(price).greaterThan(0)) continue;
      await this.prisma.instrumentPrice.upsert({
        where: { instrumentId_date: { instrumentId, date: toDbDate(fetched.date) } },
        create: { instrumentId, date: toDbDate(fetched.date), price, fetchedAt },
        update: { price, fetchedAt },
      });
    }
  }

  private async lastStored(
    ids: readonly string[],
  ): Promise<Map<string, { price: string; date: LocalDate; fetchedAt: Date }>> {
    const rows = await this.prisma.instrumentPrice.findMany({
      where: { instrumentId: { in: [...ids] } },
      orderBy: [{ date: 'desc' }, { fetchedAt: 'desc' }],
      distinct: ['instrumentId'],
    });
    return new Map(
      rows.map((row) => [
        row.instrumentId,
        { price: rate(row.price), date: date(row.date), fetchedAt: row.fetchedAt },
      ]),
    );
  }
}
