import { Injectable, Logger } from '@nestjs/common';
import type { LatestRates } from '@platin/contracts';
import { LocalDate, RateType, toDecimal } from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { date, rate, toDbDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { RateProvider } from './rate-provider';

const MAX_AGE_MS = 60 * 60 * 1000;

export interface RateOfDay {
  type: RateType;
  sell: string;
  date: LocalDate;
}

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
      take: 30,
    });
    const byType = new Map<RateType, (typeof rows)[number]>();
    for (const row of rows) if (!byType.has(row.type)) byType.set(row.type, row);
    const latestFetch = rows.reduce<Date | null>(
      (max, row) => (!max || row.fetchedAt > max ? row.fetchedAt : max),
      null,
    );
    return {
      rates: [...byType.values()].map((row) => ({
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
   * Sell rate of a type for a date: that day's or the closest previous one (weekends,
   * holidays). Refreshes first when asking for today.
   */
  async rateFor(type: RateType, day: LocalDate): Promise<RateOfDay | null> {
    if (day >= this.clock.today()) await this.refreshIfStale();
    const find = () =>
      this.prisma.exchangeRate.findFirst({
        where: { type, date: { lte: toDbDate(day) } },
        orderBy: { date: 'desc' },
      });
    let row = await find();
    if (!row) {
      // Nothing stored up to that day yet (first use): fetch today's rates and look again.
      await this.refreshIfStale();
      row = await find();
    }
    if (row) return { type, sell: rate(row.sell), date: date(row.date) };
    // A date before any stored rate: the oldest known one is the best estimate.
    const oldest = await this.prisma.exchangeRate.findFirst({
      where: { type },
      orderBy: { date: 'asc' },
    });
    return oldest ? { type, sell: rate(oldest.sell), date: date(oldest.date) } : null;
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
          return this.prisma.exchangeRate.upsert({
            where: { date_type: { date: toDbDate(today), type: r.type } },
            create: { date: toDbDate(today), type: r.type, ...values },
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
