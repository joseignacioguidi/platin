import { Injectable, Logger } from '@nestjs/common';
import type { LatestRates } from '@platin/contracts';
import { Currency, LocalDate, RateTable, RateType, toDecimal } from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { date, rate, toDbDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { RateProvider } from './rate-provider';

const MAX_AGE_MS = 60 * 60 * 1000;

export interface RateOfDay {
  currency: Currency;
  type: RateType;
  sell: string;
  date: LocalDate;
}

/** Currencies that only have the oficial rate (the dollar also has MEP and blue). */
const OFICIAL_ONLY: readonly Currency[] = ['EUR', 'BRL', 'CLP', 'UYU'];

/**
 * Rates are stored per day and type. They are refreshed (one request for all types) when there
 * is no rate for today or the last one is older than an hour; there is no cron. If the source
 * fails, the last stored rates are used and reported as stale.
 */
@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);
  private refreshing: Promise<boolean> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: RateProvider,
    private readonly clock: ClockService,
  ) {}

  /** Returns false when a refresh was needed and the source failed. */
  refreshIfStale(): Promise<boolean> {
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  async latest(): Promise<LatestRates> {
    const ok = await this.refreshIfStale();
    const rows = await this.prisma.exchangeRate.findMany({
      orderBy: [{ date: 'desc' }, { fetchedAt: 'desc' }],
      take: 60,
    });
    // The newest of each currency and type: each one falls back on its own (MON).
    const byType = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = `${row.currency}:${row.type}`;
      if (!byType.has(key)) byType.set(key, row);
    }
    const latestFetch = rows.reduce<Date | null>(
      (max, row) => (!max || row.fetchedAt > max ? row.fetchedAt : max),
      null,
    );
    return {
      rates: [...byType.values()].map((row) => ({
        currency: row.currency,
        type: row.type,
        buy: rate(row.buy),
        sell: rate(row.sell),
        date: date(row.date),
      })),
      stale: !ok,
      fetchedAt: latestFetch?.toISOString() ?? null,
    };
  }

  /**
   * Sell rate of a currency and type for a date: that day's or the closest previous one
   * (weekends, holidays). Refreshes first when asking for today.
   */
  async rateFor(
    type: RateType,
    day: LocalDate,
    currency: Currency = 'USD',
  ): Promise<RateOfDay | null> {
    if (day >= this.clock.today()) await this.refreshIfStale();
    const find = () =>
      this.prisma.exchangeRate.findFirst({
        where: { currency, type, date: { lte: toDbDate(day) } },
        orderBy: { date: 'desc' },
      });
    let row = await find();
    if (!row) {
      // Nothing stored up to that day yet (first use): fetch today's rates and look again.
      await this.refreshIfStale();
      row = await find();
    }
    if (row) return { currency, type, sell: rate(row.sell), date: date(row.date) };
    // A date before any stored rate: the oldest known one is the best estimate.
    const oldest = await this.prisma.exchangeRate.findFirst({
      where: { currency, type },
      orderBy: { date: 'asc' },
    });
    return oldest ? { currency, type, sell: rate(oldest.sell), date: date(oldest.date) } : null;
  }

  /**
   * Pesos per unit of each currency for a date: the dollar of the preferred type, the others at
   * the oficial rate. A currency without any stored rate is left out (it can't be valued).
   */
  async tableFor(dollarType: RateType, day: LocalDate): Promise<RateTable> {
    const [usd, ...others] = await Promise.all([
      this.rateFor(dollarType, day, 'USD'),
      ...OFICIAL_ONLY.map((currency) => this.rateFor('OFICIAL', day, currency)),
    ]);
    const table: RateTable = {};
    for (const found of [usd, ...others]) if (found) table[found.currency] = found.sell;
    return table;
  }

  private async refresh(): Promise<boolean> {
    const today = this.clock.today();
    const last = await this.prisma.exchangeRate.findFirst({
      where: { date: toDbDate(today) },
      orderBy: { fetchedAt: 'desc' },
    });
    if (last && this.clock.now().getTime() - last.fetchedAt.getTime() < MAX_AGE_MS) return true;
    try {
      const rates = await this.provider.fetchAll();
      const fetchedAt = this.clock.now();
      await this.prisma.$transaction(
        rates.map((r) => {
          const values = {
            buy: toDecimal(r.buy).toFixed(6),
            sell: toDecimal(r.sell).toFixed(6),
            source: this.provider.name,
            fetchedAt,
          };
          const currency = r.currency ?? 'USD';
          return this.prisma.exchangeRate.upsert({
            where: {
              date_currency_type: { date: toDbDate(today), currency, type: r.type },
            },
            create: { date: toDbDate(today), currency, type: r.type, ...values },
            update: values,
          });
        }),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Rates refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
