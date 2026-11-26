import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  CreateValuationsRequest,
  InvestmentPocket,
  Investments,
  TermDepositRequest,
  Valuation,
  ValuationsResponse,
} from '@platin/contracts';
import {
  autoValuationsDue,
  canConvert,
  compareDates,
  CURRENCIES,
  Currency,
  Decimal,
  investmentSummary,
  LocalDate,
  localDateAt,
  maxDate,
  Money,
  parseLocalDate,
  RatesInput,
  valuationOverdue,
  valueIn,
  yieldFromValuation,
} from '@platin/domain';
import { PocketBalancesService } from '../accounts/pocket-balances.service';
import {
  PocketsService,
  PocketWithAccount,
  toPocketDto,
  WITH_ACCOUNT,
} from '../accounts/pockets.service';
import { AppException } from '../common/app-exception';
import { freezeBase } from '../common/base-conversion';
import { ClockService } from '../common/clock.service';
import { baseCurrency, date, money, toDbDate } from '../common/serialize';
import { Prisma } from '../generated/prisma/client';
import { EntitlementsService } from '../plans/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { UserRates } from '../rates/user-rates.service';
import { InvestmentPricingService, PricingData } from './investment-pricing.service';

const VALUATION_INCLUDE = { transaction: { select: { amount: true } } } as const;
type ValuationRow = Prisma.PocketValuationGetPayload<{ include: typeof VALUATION_INCLUDE }>;

function toValuationDto(row: ValuationRow): Valuation {
  return {
    id: row.id,
    pocketId: row.pocketId,
    date: date(row.date),
    value: money(row.value),
    source: row.source,
    yield: row.transaction ? money(row.transaction.amount) : '0.00',
    transactionId: row.transactionId,
  };
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Valued by hand: neither linked to an instrument nor a term deposit. */
const isManual = (pocketId: string, data: PricingData): boolean =>
  !data.holdings.has(pocketId) && !data.termDeposits.has(pocketId);

const emptyTotals = (currency: Currency) => ({
  invested: Money.zero(currency),
  value: Money.zero(currency),
  yield: Money.zero(currency),
});

/**
 * INV-01..05: investments are pockets of kind INVESTMENT valued by hand. Each valuation records
 * the difference to the calculated balance as a YIELD movement, so the balance becomes the
 * value entered.
 */
@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: PocketBalancesService,
    private readonly pockets: PocketsService,
    private readonly rates: RatesService,
    private readonly userRates: UserRates,
    private readonly clock: ClockService,
    private readonly pricing: InvestmentPricingService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** INV-05: every investment pocket with its summary, pricing, totals and composition. */
  overview(userId: string): Promise<Investments> {
    return this.build(userId, {
      userId,
      kind: 'INVESTMENT',
      archivedAt: null,
      account: { archivedAt: null },
    });
  }

  /** One investment pocket as GET /investments shows it (also archived), for its detail. */
  async pocket(userId: string, pocketId: string): Promise<InvestmentPocket> {
    const owned = await this.pockets.getOwned(userId, pocketId);
    if (owned.kind !== 'INVESTMENT') throw this.notAnInvestment();
    const result = await this.build(userId, { id: pocketId, userId });
    return result.accounts[0].pockets[0];
  }

  private async build(userId: string, where: Prisma.PocketWhereInput): Promise<Investments> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rows = await this.prisma.pocket.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, archivedAt: true } },
        valuations: { orderBy: { date: 'asc' }, include: VALUATION_INCLUDE },
      },
      orderBy: [{ account: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const ids = rows.map((row) => row.id);
    const pricingData = await this.pricing.load(userId, ids);
    const [balances, transfers, latest] = await Promise.all([
      this.balances.balances(userId, rows),
      this.prisma.transfer.findMany({
        where: { userId, OR: [{ fromPocketId: { in: ids } }, { toPocketId: { in: ids } }] },
        select: { fromPocketId: true, toPocketId: true, amountOut: true, amountIn: true },
      }),
      this.pricing.latestPrices(pricingData),
    ]);
    const baseCode = baseCurrency(user.baseCurrency);
    const rates = await this.rates.tableFor(user.valuationRate, this.clock.today());
    // A currency without a known rate can't be valued: it adds zero to the base totals.
    const toBase = (amount: Money) =>
      canConvert(amount.currency, baseCode, rates)
        ? valueIn(amount, baseCode, rates)
        : Money.zero(baseCode);

    const totals = new Map<Currency, ReturnType<typeof emptyTotals>>();
    const base = emptyTotals(baseCode);
    const byInstrument = new Map<string, Money>();
    const accounts: Investments['accounts'] = [];

    for (const row of rows) {
      const balance = balances.get(row.id) ?? Money.zero(row.currency);
      const summary = investmentSummary(
        { initialBalance: Money.of(row.initialBalance.toFixed(2), row.currency), balance },
        transfers.flatMap((t) => [
          ...(t.toPocketId === row.id
            ? [{ direction: 'IN' as const, amount: t.amountIn.toFixed(2) }]
            : []),
          ...(t.fromPocketId === row.id
            ? [{ direction: 'OUT' as const, amount: t.amountOut.toFixed(2) }]
            : []),
        ]),
        row.valuations.map((v) => ({
          amount: v.transaction ? v.transaction.amount.toFixed(2) : '0',
        })),
      );
      const last = row.valuations.at(-1);
      const pricing = this.pricing.pricingFor(
        row,
        {
          invested: summary.investedNet,
          value: summary.currentValue,
          yield: summary.accumulatedYield,
          yieldRate: summary.yieldRate,
        },
        pricingData,
        latest,
      );
      // The totals use the live value of the automatic ones (ADR 0040).
      const value = Money.of(pricing.marketValue, row.currency);
      const yieldAmount = Money.of(pricing.liveYield, row.currency);
      const pocket: InvestmentPocket = {
        ...toPocketDto(row, balance),
        summary: {
          invested: summary.investedNet.toString(),
          value: summary.currentValue.toString(),
          yield: summary.accumulatedYield.toString(),
          yieldRate: summary.yieldRate,
          lastYield: summary.lastYield.toString(),
        },
        pricing,
        lastValuation: last ? toValuationDto(last) : null,
      };
      let group = accounts.find((a) => a.id === row.account.id);
      if (!group) {
        group = { id: row.account.id, name: row.account.name, pockets: [] };
        accounts.push(group);
      }
      group.pockets.push(pocket);

      const sums = totals.get(row.currency) ?? emptyTotals(row.currency);
      totals.set(row.currency, sums);
      sums.invested = sums.invested.add(summary.investedNet);
      sums.value = sums.value.add(value);
      sums.yield = sums.yield.add(yieldAmount);
      base.invested = base.invested.add(toBase(summary.investedNet));
      base.value = base.value.add(toBase(value));
      base.yield = base.yield.add(toBase(yieldAmount));
      const instrument = row.instrument ?? 'OTHER';
      byInstrument.set(
        instrument,
        (byInstrument.get(instrument) ?? Money.zero(user.baseCurrency)).add(toBase(value)),
      );
    }

    // "Valores cargados a mano": the automatic ones have their own date (INV-11).
    const manual = rows.filter((row) => isManual(row.id, pricingData));
    const lastValuationDate = this.lastValuationDate(manual.flatMap((row) => row.valuations));
    const totalsDto = (t: ReturnType<typeof emptyTotals>) => ({
      invested: t.invested.toString(),
      value: t.value.toString(),
      yield: t.yield.toString(),
    });
    return {
      accounts,
      // One line per currency with investments, in the app's order (MON-03).
      totals: CURRENCIES.filter((currency) => totals.has(currency)).map((currency) => ({
        currency,
        ...totalsDto(totals.get(currency) as ReturnType<typeof emptyTotals>),
      })),
      base: {
        currency: baseCode,
        ...totalsDto(base),
        yieldRate: base.invested.amount.greaterThan(0)
          ? base.yield.amount.dividedBy(base.invested.amount).toFixed(4, Decimal.ROUND_HALF_UP)
          : null,
        byInstrument: [...byInstrument.entries()]
          .filter(([, value]) => value.amount.greaterThan(0))
          .sort(([, a], [, b]) => b.compare(a))
          .map(([instrument, value]) => ({
            instrument: instrument as InvestmentPocket['instrument'] & string,
            value: value.toString(),
          })),
      },
      lastValuationDate,
      overdue: this.isOverdue(manual),
    };
  }

  /** INV-03 for the home screen: is it time to update the values? */
  async overdue(userId: string): Promise<boolean> {
    const rows = await this.prisma.pocket.findMany({
      // Only the ones valued by hand: the automatic ones value themselves (INV-11).
      where: {
        userId,
        kind: 'INVESTMENT',
        archivedAt: null,
        account: { archivedAt: null },
        holding: { is: null },
        termDeposit: { is: null },
      },
      select: {
        createdAt: true,
        valuations: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
      },
    });
    return this.isOverdue(rows);
  }

  /**
   * INV-03/04: one valuation per pocket. Each records the difference to the balance at its
   * date as a YIELD movement (none when it is 0), in one transaction for the whole batch.
   */
  async createValuations(
    userId: string,
    request: CreateValuationsRequest,
  ): Promise<ValuationsResponse> {
    const today = this.clock.today();
    const items: { pocket: PocketWithAccount; day: LocalDate; value: Money }[] = [];
    for (const item of request.items) {
      const day = parseLocalDate(item.date);
      const pocket = await this.pockets.getActive(userId, item.pocketId);
      if (pocket.kind !== 'INVESTMENT') throw this.notAnInvestment();
      if (compareDates(day, today) > 0) {
        throw new AppException(
          'VALUATION_IN_FUTURE',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'A valuation cannot be dated in the future',
        );
      }
      const latest = await this.prisma.pocketValuation.findFirst({
        where: { pocketId: pocket.id },
        orderBy: { date: 'desc' },
      });
      if (latest && compareDates(day, date(latest.date)) <= 0) {
        throw new AppException(
          'VALUATION_NOT_LATEST',
          HttpStatus.CONFLICT,
          'There is already a valuation on that date or a later one',
        );
      }
      items.push({ pocket, day, value: Money.of(item.value, pocket.currency) });
    }
    const ids = await this.writeValuations(userId, items, 'MANUAL');
    const rows = await this.prisma.pocketValuation.findMany({
      where: { id: { in: ids } },
      include: VALUATION_INCLUDE,
    });
    return {
      items: ids.map((id) => toValuationDto(rows.find((r) => r.id === id) as ValuationRow)),
    };
  }

  /**
   * INV-11 (POST /sync): the month-end valuation of each investment with an automatic value,
   * dated the last day of the previous month, with the same YIELD movement as a manual one.
   * Idempotent: autoValuationsDue skips the ones already valued, and a concurrent sync that
   * created the same row first wins (unique pocket and date). Never throws: a sync does not fail
   * because a price is missing. Returns how many it created.
   */
  async autoValuate(userId: string): Promise<number> {
    try {
      if (!(await this.entitlements.includes(userId, 'investments'))) return 0;
      const rows = await this.prisma.pocket.findMany({
        where: {
          userId,
          kind: 'INVESTMENT',
          archivedAt: null,
          account: { archivedAt: null },
          OR: [{ holding: { isNot: null } }, { termDeposit: { isNot: null } }],
        },
        include: {
          ...WITH_ACCOUNT,
          valuations: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
        },
      });
      if (rows.length === 0) return 0;
      const data = await this.pricing.load(
        userId,
        rows.map((row) => row.id),
      );
      const due = autoValuationsDue(
        rows.flatMap((row) => {
          const since = this.pricing.since(row.id, data);
          const last = row.valuations[0];
          return since
            ? [{ pocketId: row.id, since, lastValuation: last ? date(last.date) : null }]
            : [];
        }),
        this.clock.today(),
      );
      const items: { pocket: PocketWithAccount; day: LocalDate; value: Money }[] = [];
      for (const { pocketId, date: day } of due) {
        const pocket = rows.find((row) => row.id === pocketId) as PocketWithAccount;
        const value = await this.pricing.valueAt(pocket, data, day);
        if (value) items.push({ pocket, day, value });
      }
      if (items.length === 0) return 0;
      return (await this.writeValuations(userId, items, 'AUTO')).length;
    } catch (error) {
      if (isUniqueViolation(error)) return 0;
      this.logger.warn(`Automatic valuations failed: ${(error as Error).message}`);
      return 0;
    }
  }

  /** Records valuations and their yields in one transaction. Returns their ids in order. */
  private async writeValuations(
    userId: string,
    items: readonly { pocket: PocketWithAccount; day: LocalDate; value: Money }[],
    source: 'MANUAL' | 'AUTO',
  ): Promise<string[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const category = await this.prisma.category.findUniqueOrThrow({
      where: { userId_systemKey: { userId, systemKey: 'YIELD' } },
      select: { id: true },
    });
    const prepared: {
      pocket: PocketWithAccount;
      day: LocalDate;
      value: Money;
      difference: Money;
      rate: RatesInput | undefined;
    }[] = [];
    for (const { pocket, day, value } of items) {
      const difference = yieldFromValuation(
        await this.balances.balance(userId, pocket, day),
        value,
      );
      const rate =
        pocket.currency === user.baseCurrency || difference.isZero()
          ? undefined
          : await this.userRates.tableFor(userId, day);
      prepared.push({ pocket, day, value, difference, rate });
    }

    return this.prisma.$transaction(async (tx) => {
      const created: string[] = [];
      for (const { pocket, day, value, difference, rate } of prepared) {
        let transactionId: string | null = null;
        if (!difference.isZero()) {
          const frozen = freezeBase(difference, user.baseCurrency, rate);
          const movement = await tx.transaction.create({
            data: {
              userId,
              pocketId: pocket.id,
              categoryId: category.id,
              type: 'YIELD',
              origin: 'VALUATION',
              status: 'CONFIRMED',
              amount: difference.toString(),
              currency: pocket.currency,
              rateToBase: frozen.rateToBase,
              baseAmount: frozen.baseAmount,
              date: toDbDate(day),
            },
          });
          transactionId = movement.id;
        }
        const valuation = await tx.pocketValuation.create({
          data: {
            pocketId: pocket.id,
            date: toDbDate(day),
            value: value.toString(),
            transactionId,
            source,
          },
        });
        created.push(valuation.id);
      }
      return created;
    });
  }

  /**
   * INV-12: sets or changes the terms of a term deposit (changing them renews it). Only for an
   * investment pocket of type term deposit, never linked to an instrument.
   */
  async putTermDeposit(
    userId: string,
    pocketId: string,
    request: TermDepositRequest,
  ): Promise<InvestmentPocket> {
    const pocket = await this.pockets.getActive(userId, pocketId);
    if (pocket.kind !== 'INVESTMENT') throw this.notAnInvestment();
    if (pocket.instrument !== 'TERM_DEPOSIT') {
      throw new AppException(
        'INSTRUMENT_TYPE_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Only an investment of type term deposit has terms',
      );
    }
    if (compareDates(request.endDate, request.startDate) <= 0) {
      throw new AppException(
        'TERM_DEPOSIT_DATES',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The end date has to be after the start date',
      );
    }
    const terms = {
      principal: request.principal,
      tna: request.tna,
      startDate: toDbDate(request.startDate),
      endDate: toDbDate(request.endDate),
    };
    await this.prisma.$transaction([
      // A pocket is either linked or a term deposit, never both.
      this.prisma.pocketHolding.deleteMany({ where: { pocketId } }),
      this.prisma.termDeposit.upsert({
        where: { pocketId },
        create: { pocketId, ...terms },
        update: terms,
      }),
    ]);
    return this.pocket(userId, pocketId);
  }

  private notAnInvestment(): AppException {
    return new AppException(
      'NOT_AN_INVESTMENT',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Only investment pockets are valued',
    );
  }

  /** The valuations of one investment pocket, newest first. */
  async valuationsOf(userId: string, pocketId: string): Promise<ValuationsResponse> {
    await this.pockets.getOwned(userId, pocketId);
    const rows = await this.prisma.pocketValuation.findMany({
      where: { pocketId },
      orderBy: { date: 'desc' },
      include: VALUATION_INCLUDE,
    });
    return { items: rows.map(toValuationDto) };
  }

  /** Deleting the last valuation deletes its yield; earlier ones stay while a later one exists. */
  async removeValuation(userId: string, id: string): Promise<void> {
    const row = await this.prisma.pocketValuation.findFirst({ where: { id, pocket: { userId } } });
    if (!row) throw AppException.notFound('Valuation not found');
    const later = await this.prisma.pocketValuation.count({
      where: { pocketId: row.pocketId, date: { gt: row.date } },
    });
    if (later > 0) {
      throw new AppException(
        'VALUATION_NOT_LATEST',
        HttpStatus.CONFLICT,
        'Only the last valuation of an investment can be deleted',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.pocketValuation.delete({ where: { id } });
      if (row.transactionId) await tx.transaction.delete({ where: { id: row.transactionId } });
    });
  }

  private lastValuationDate(valuations: readonly { date: Date }[]): LocalDate | null {
    return valuations.reduce<LocalDate | null>(
      (last, v) => (last ? maxDate(last, date(v.date)) : date(v.date)),
      null,
    );
  }

  /** Overdue since the last valuation or, without any, since the oldest investment. */
  private isOverdue(pockets: readonly { createdAt: Date; valuations: { date: Date }[] }[]): boolean {
    if (pockets.length === 0) return false;
    const since =
      this.lastValuationDate(pockets.flatMap((p) => p.valuations)) ??
      pockets
        .map((p) => localDateAt(p.createdAt))
        .reduce((a, b) => (compareDates(a, b) <= 0 ? a : b));
    return valuationOverdue(since, this.clock.today());
  }
}
