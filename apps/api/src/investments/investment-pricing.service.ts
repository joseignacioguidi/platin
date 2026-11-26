import { Injectable } from '@nestjs/common';
import type { Listing, Pricing } from '@platin/contracts';
import {
  compareDates,
  Currency,
  Decimal,
  holdingUnits,
  LocalDate,
  localDateAt,
  marketValue,
  Money,
  termDepositPosition,
  TermDepositTerms,
  UnitsChange,
  UNITS_DECIMALS,
} from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { date, money } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { LatestPrice, PricesService } from '../prices/prices.service';

/** Everything that gives an investment an automatic value, loaded once for many pockets. */
export interface PricingData {
  holdings: Map<
    string,
    { instrumentId: string; initialUnits: string; createdAt: Date; listing: Listing }
  >;
  termDeposits: Map<string, TermDepositTerms>;
  /** Unit changes (transfers with units and corrections) by pocket. */
  changes: Map<string, UnitsChange[]>;
  /** Money that went out of each pocket, with its date (term deposit redemptions). */
  outflows: Map<string, { date: LocalDate; amount: string }[]>;
}

export interface PricingPocket {
  id: string;
  currency: Currency;
}

const ratio = (yieldAmount: Money, invested: Money): string | null =>
  invested.amount.greaterThan(0)
    ? yieldAmount.amount.dividedBy(invested.amount).toFixed(4, Decimal.ROUND_HALF_UP)
    : null;

const units = (value: Decimal): string => value.toFixed(UNITS_DECIMALS);

/**
 * INV-08 / INV-11 / INV-12: how an investment is valued. A manual one is worth its balance; a
 * linked one, units × last price; a term deposit, what its terms give. The live value never
 * creates movements: the balance follows it with the month-end valuation (ADR 0040).
 */
@Injectable()
export class InvestmentPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
    private readonly clock: ClockService,
  ) {}

  async load(userId: string, pocketIds: readonly string[]): Promise<PricingData> {
    const ids = [...pocketIds];
    const owned = { pocketId: { in: ids }, pocket: { userId } };
    const [holdings, deposits, adjustments, transfers] = await Promise.all([
      this.prisma.pocketHolding.findMany({ where: owned, include: { instrument: true } }),
      this.prisma.termDeposit.findMany({ where: owned, include: { pocket: true } }),
      this.prisma.holdingAdjustment.findMany({ where: owned }),
      this.prisma.transfer.findMany({
        where: { userId, OR: [{ fromPocketId: { in: ids } }, { toPocketId: { in: ids } }] },
        select: { fromPocketId: true, toPocketId: true, amountOut: true, units: true, date: true },
      }),
    ]);
    const changes = new Map<string, UnitsChange[]>();
    const outflows = new Map<string, { date: LocalDate; amount: string }[]>();
    const push = <T>(map: Map<string, T[]>, key: string, item: T) =>
      map.set(key, [...(map.get(key) ?? []), item]);
    for (const row of adjustments) {
      push(changes, row.pocketId, {
        date: date(row.date),
        direction: row.direction,
        units: row.units.toFixed(UNITS_DECIMALS),
      });
    }
    for (const t of transfers) {
      const day = date(t.date);
      if (t.units && t.toPocketId && ids.includes(t.toPocketId)) {
        push(changes, t.toPocketId, { date: day, direction: 'IN', units: t.units.toFixed(UNITS_DECIMALS) });
      }
      if (ids.includes(t.fromPocketId)) {
        if (t.units) {
          push(changes, t.fromPocketId, {
            date: day,
            direction: 'OUT',
            units: t.units.toFixed(UNITS_DECIMALS),
          });
        }
        push(outflows, t.fromPocketId, { date: day, amount: money(t.amountOut) });
      }
    }
    return {
      holdings: new Map(
        holdings.map((h) => [
          h.pocketId,
          {
            instrumentId: h.instrumentId,
            initialUnits: h.initialUnits.toFixed(UNITS_DECIMALS),
            createdAt: h.createdAt,
            listing: {
              id: h.instrument.id,
              symbol: h.instrument.symbol,
              name: h.instrument.name,
              type: h.instrument.type,
              currency: h.instrument.currency,
            },
          },
        ]),
      ),
      termDeposits: new Map(
        deposits.map((t) => [
          t.pocketId,
          {
            principal: Money.of(money(t.principal), t.pocket.currency),
            tna: t.tna.toFixed(6),
            startDate: date(t.startDate),
            endDate: date(t.endDate),
          },
        ]),
      ),
      changes,
      outflows,
    };
  }

  /** The last prices of the linked instruments, refreshing the old ones. */
  latestPrices(data: PricingData): Promise<Map<string, LatestPrice>> {
    return this.prices.latest([...data.holdings.values()].map((h) => h.instrumentId));
  }

  /** What has gone out of a term deposit since it started, up to a date. */
  private redeemed(data: PricingData, pocket: PricingPocket, terms: TermDepositTerms, at: LocalDate) {
    return Money.sum(
      (data.outflows.get(pocket.id) ?? [])
        .filter(
          (o) => compareDates(o.date, terms.startDate) >= 0 && compareDates(o.date, at) <= 0,
        )
        .map((o) => Money.of(o.amount, pocket.currency)),
      pocket.currency,
    );
  }

  /** INV-08 / INV-12: the pricing block of GET /investments for one pocket. */
  pricingFor(
    pocket: PricingPocket,
    summary: { invested: Money; value: Money; yield: Money; yieldRate: string | null },
    data: PricingData,
    latest: Map<string, LatestPrice>,
  ): Pricing {
    const today = this.clock.today();
    const empty = {
      units: null,
      price: null,
      priceDate: null,
      stale: false,
      listing: null,
      termDeposit: null,
    };
    const terms = data.termDeposits.get(pocket.id);
    if (terms) {
      const position = termDepositPosition(terms, this.redeemed(data, pocket, terms, today), today);
      const liveYield = position.value.subtract(summary.invested);
      return {
        ...empty,
        mode: 'TERM_DEPOSIT',
        marketValue: position.value.toString(),
        liveYield: liveYield.toString(),
        liveYieldRate: ratio(liveYield, summary.invested),
        termDeposit: {
          principal: terms.principal.toString(),
          tna: new Decimal(terms.tna).toFixed(6),
          startDate: terms.startDate,
          endDate: terms.endDate,
          matured: position.matured,
          redeemed: position.redeemed,
        },
      };
    }
    const holding = data.holdings.get(pocket.id);
    if (holding) {
      const held = holdingUnits(holding.initialUnits, data.changes.get(pocket.id) ?? []);
      const price = latest.get(holding.instrumentId);
      // Without any stored price yet, it shows its balance until the first one arrives.
      const value = price ? marketValue(held, price.price, pocket.currency) : summary.value;
      const liveYield = value.subtract(summary.invested);
      return {
        ...empty,
        mode: 'MARKET',
        units: units(held),
        price: price?.price ?? null,
        priceDate: price?.date ?? null,
        stale: price ? price.stale : true,
        marketValue: value.toString(),
        liveYield: liveYield.toString(),
        liveYieldRate: ratio(liveYield, summary.invested),
        listing: holding.listing,
      };
    }
    return {
      ...empty,
      mode: 'MANUAL',
      marketValue: summary.value.toString(),
      liveYield: summary.yield.toString(),
      liveYieldRate: summary.yieldRate,
    };
  }

  /**
   * INV-11: the automatic value of an investment at a date (null for a manual one, or a linked
   * one without any price up to that date).
   */
  async valueAt(pocket: PricingPocket, data: PricingData, day: LocalDate): Promise<Money | null> {
    const terms = data.termDeposits.get(pocket.id);
    if (terms) {
      const position = termDepositPosition(terms, this.redeemed(data, pocket, terms, day), day);
      return position.value;
    }
    const holding = data.holdings.get(pocket.id);
    if (!holding) return null;
    const price = await this.prices.priceAt(holding.instrumentId, day);
    if (!price) return null;
    const held = holdingUnits(holding.initialUnits, data.changes.get(pocket.id) ?? [], day);
    return marketValue(held, price.price, pocket.currency);
  }

  /** From when each automatic investment has its value, for autoValuationsDue. */
  since(pocketId: string, data: PricingData): LocalDate | null {
    const terms = data.termDeposits.get(pocketId);
    if (terms) return terms.startDate;
    const holding = data.holdings.get(pocketId);
    return holding ? localDateAt(holding.createdAt) : null;
  }

}
