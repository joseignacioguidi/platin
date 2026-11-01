import { Injectable } from '@nestjs/common';
import type { ColorToken, Dashboard, UpcomingItem } from '@platin/contracts';
import {
  addDays,
  compareDates,
  Currency,
  duePeriods,
  firstDayOf,
  freeThisMonth,
  lastDayOf,
  LocalDate,
  Money,
  Period,
  periodOf,
  PocketKind,
  RateTable,
  RateType,
  SeparatedTransfer,
  separatedThisMonth,
  transferBaseValue,
  utcToLocalDate,
  utcToPeriod,
  valueIn,
  canConvert,
  commitmentsByMonth,
} from '@platin/domain';
import { STATEMENT_PARTS, statementTotals } from '../cards/statement-math';
import { ClockService } from '../common/clock.service';
import { CommitmentsInputBuilder } from '../commitments/commitments-input';
import { baseCurrency, date, money as money2, toDbDate, toDbPeriod } from '../common/serialize';
import { FIXED_INCLUDE, FixedRow, toSchedule } from '../fixed/fixed.mapper';
import type { Prisma } from '../generated/prisma/client';
import { InvestmentsService } from '../investments/investments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { UserRates } from '../rates/user-rates.service';

const UPCOMING_DAYS = 30;

const STATEMENT_WITH_CARD = { ...STATEMENT_PARTS, card: { select: { name: true } } } as const;
type StatementRow = Prisma.CardStatementGetPayload<{ include: typeof STATEMENT_WITH_CARD }>;

/**
 * DAS-01. All amounts in base currency:
 * - expected income = fixed incomes of the month (the confirmed amount once confirmed) + other
 *   confirmed incomes;
 * - spent = confirmed expenses + card purchases of the month;
 * - expected income also adds the scheduled incomes of the month (MOV-08);
 * - committed = what is still to pay this month, with the rule and input of Compromisos
 *   (commitmentsByMonth): pending part of unpaid statements due, unconfirmed fixed expenses on a
 *   pocket or a card, and scheduled expenses;
 * - separated = transfers of the month to savings or investments, minus the ones coming back;
 * - free = expected − committed − spent − separated.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly rates: RatesService,
    private readonly userRates: UserRates,
    private readonly investments: InvestmentsService,
    private readonly commitments: CommitmentsInputBuilder,
  ) {}

  async get(userId: string, requested?: Period): Promise<Dashboard> {
    const today = this.clock.today();
    const period = requested ?? periodOf(today);
    const range = { gte: toDbDate(firstDayOf(period)), lte: toDbDate(lastDayOf(period)) };
    const fresh = await this.rates.refreshIfStale();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const base = baseCurrency(user.baseCurrency);
    // Today's rates: the dollar of the preferred type, the other currencies at the oficial rate.
    const todayRate = await this.rates.rateFor(user.valuationRate, today);
    const todayRates = await this.rates.tableFor(user.valuationRate, today);
    const toBase = (money: Money) =>
      canConvert(money.currency, base, todayRates)
        ? valueIn(money, base, todayRates)
        : Money.zero(base);

    const [otherIncome, expenses, charges, fixedItems, monthFixedTx, statements, pending, built] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            userId,
            date: range,
            status: 'CONFIRMED',
            type: 'INCOME',
            origin: { not: 'FIXED' },
          },
          _sum: { baseAmount: true },
        }),
        this.prisma.transaction.aggregate({
          where: { userId, date: range, status: 'CONFIRMED', type: 'EXPENSE' },
          _sum: { baseAmount: true },
        }),
        this.prisma.cardCharge.findMany({ where: { userId, date: range } }),
        this.prisma.fixedItem.findMany({
          where: { userId, pocketId: { not: null } },
          include: FIXED_INCLUDE,
        }),
        this.prisma.transaction.findMany({
          where: { userId, origin: 'FIXED', fixedPeriod: toDbPeriod(period) },
        }),
        this.prisma.cardStatement.findMany({
          where: {
            userId,
            status: { not: 'PAID' },
            dueDate: { gte: toDbDate(today), lte: toDbDate(addDays(today, UPCOMING_DAYS)) },
          },
          include: STATEMENT_WITH_CARD,
          orderBy: { dueDate: 'asc' },
        }),
        // "Para confirmar": pending movements whose date arrived (scheduled ones wait for it).
        this.prisma.transaction.findMany({
          where: { userId, status: 'PENDING', date: { lte: toDbDate(today) } },
          orderBy: { date: 'asc' },
          select: { description: true },
        }),
        this.commitments.build(userId, period, period),
      ]);

    const money = (value: { toFixed(d: number): string } | null) =>
      Money.of((value ?? 0).toFixed(2), base);

    // Fixed incomes of the month: confirmed ones by their real amount, the rest by the expected one.
    let fixedIncome = Money.zero(base);
    for (const fixed of fixedItems.filter((f) => f.kind === 'INCOME')) {
      for (const due of duePeriods(toSchedule(fixed), period, period)) {
        const tx = monthFixedTx.find((t) => t.fixedId === fixed.id);
        fixedIncome = fixedIncome.add(
          tx?.status === 'CONFIRMED'
            ? money(tx.baseAmount)
            : toBase(tx ? Money.of(tx.amount.toFixed(2), tx.currency) : due.amount),
        );
      }
    }
    // Scheduled incomes of the month not confirmed yet (MOV-08).
    const scheduledIncome = Money.sum(
      (built.input.scheduled ?? []).filter((s) => s.kind === 'INCOME').map((s) => toBase(s.amount)),
      base,
    );

    let cardSpent = Money.zero(base);
    for (const charge of charges) {
      const amount = Money.of(charge.totalAmount.toFixed(2), charge.currency);
      if (charge.currency === base) {
        cardSpent = cardSpent.add(amount);
        continue;
      }
      const rate = await this.userRates.sellFor(userId, utcToLocalDate(charge.date));
      if (rate) cardSpent = cardSpent.add(valueIn(amount, base, rate));
    }

    // The same rule and input as Compromisos (COM-02), for this month.
    const [month] = commitmentsByMonth(built.input, period, 1);
    const expectedIncome = money(otherIncome._sum.baseAmount).add(fixedIncome).add(scheduledIncome);
    const spent = money(expenses._sum.baseAmount).add(cardSpent);
    const committed = month.committed.base;
    const separated = await this.separated(userId, base, user.valuationRate, range);

    return {
      period,
      currency: base,
      expectedIncome: expectedIncome.toString(),
      spent: spent.toString(),
      committed: committed.toString(),
      separated: separated.toString(),
      free: freeThisMonth(expectedIncome, committed, spent, separated).toString(),
      pending: {
        count: pending.length,
        names: pending.slice(0, 3).map((p) => p.description ?? ''),
      },
      upcoming: this.upcoming(
        today,
        statements,
        fixedItems,
        await this.confirmedFixedKeys(userId, today),
        await this.upcomingScheduled(userId, today),
      ),
      rate: todayRate
        ? {
            type: todayRate.type,
            sell: todayRate.sell,
            date: todayRate.date,
            stale: !fresh || todayRate.date !== today,
          }
        : null,
      valuationsOverdue: await this.investments.overdue(userId),
    };
  }

  /**
   * DAS-05: transfers of the month between available and savings/investment pockets, valued in
   * base currency (the base side if any, else the rate of the transfer's date; ADR 0021).
   */
  private async separated(
    userId: string,
    base: Currency,
    valuationRate: RateType,
    range: { gte: Date; lte: Date },
  ): Promise<Money> {
    const transfers = await this.prisma.transfer.findMany({
      where: { userId, date: range, toPocketId: { not: null } },
      include: {
        fromPocket: { select: { kind: true, currency: true } },
        toPocket: { select: { kind: true, currency: true } },
      },
    });
    const kinds = new Map<string, PocketKind>();
    const tables = new Map<LocalDate, RateTable>();
    const items: SeparatedTransfer[] = [];
    for (const transfer of transfers) {
      if (!transfer.toPocket || !transfer.toPocketId) continue;
      kinds.set(transfer.fromPocketId, transfer.fromPocket.kind);
      kinds.set(transfer.toPocketId, transfer.toPocket.kind);
      const out = Money.of(transfer.amountOut.toFixed(2), transfer.fromPocket.currency);
      const into = Money.of(transfer.amountIn.toFixed(2), transfer.toPocket.currency);
      let table: RateTable | undefined;
      if (out.currency !== base && into.currency !== base) {
        const day = utcToLocalDate(transfer.date);
        table = tables.get(day) ?? (await this.rates.tableFor(valuationRate, day));
        tables.set(day, table);
      }
      items.push({
        fromPocketId: transfer.fromPocketId,
        toPocketId: transfer.toPocketId,
        value: transferBaseValue(out, into, base, table),
      });
    }
    return separatedThisMonth(items, kinds, base);
  }

  /** Statements due and fixed occurrences in the next 30 days, by date. */
  private upcoming(
    today: LocalDate,
    statements: StatementRow[],
    fixedItems: FixedRow[],
    confirmed: Set<string>,
    scheduled: UpcomingItem[],
  ): UpcomingItem[] {
    const until = addDays(today, UPCOMING_DAYS);
    const items: UpcomingItem[] = [...scheduled];
    for (const statement of statements) {
      const due = utcToLocalDate(statement.dueDate);
      if (compareDates(due, today) < 0) continue;
      const totals = statementTotals(statement);
      if (totals.pending.ARS.isZero() && totals.pending.USD.isZero()) continue;
      items.push({
        type: 'STATEMENT',
        date: due,
        statementId: statement.id,
        cardId: statement.cardId,
        cardName: statement.card.name,
        ARS: totals.pending.ARS.toString(),
        USD: totals.pending.USD.toString(),
      });
    }
    for (const fixed of fixedItems) {
      for (const due of duePeriods(toSchedule(fixed), periodOf(today), periodOf(until))) {
        if (compareDates(due.date, today) < 0 || compareDates(due.date, until) > 0) continue;
        if (confirmed.has(`${fixed.id}|${due.period}`)) continue;
        items.push({
          type: 'FIXED',
          date: due.date,
          fixedId: fixed.id,
          kind: fixed.kind,
          name: fixed.name,
          pocketName: fixed.pocket?.name ?? '',
          accountName: fixed.pocket?.account.name ?? '',
          amount: due.amount.toString(),
          currency: fixed.currency as Currency,
        });
      }
    }
    return items.sort((a, b) => compareDates(a.date as LocalDate, b.date as LocalDate));
  }

  /** MOV-08: scheduled incomes and expenses of the next 30 days. */
  private async upcomingScheduled(userId: string, today: LocalDate): Promise<UpcomingItem[]> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        origin: 'SCHEDULED',
        status: 'PENDING',
        date: { gte: toDbDate(today), lte: toDbDate(addDays(today, UPCOMING_DAYS)) },
      },
      include: {
        pocket: { select: { name: true, account: { select: { name: true } } } },
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
    });
    return rows.map((row) => ({
      type: 'SCHEDULED',
      date: date(row.date),
      id: row.id,
      kind: row.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      description: row.description ?? row.category?.name ?? '',
      pocketName: row.pocket.name,
      accountName: row.pocket.account.name,
      amount: money2(row.amount),
      currency: row.currency,
      category: row.category ? { ...row.category, color: row.category.color as ColorToken } : null,
    }));
  }

  private async confirmedFixedKeys(userId: string, today: LocalDate): Promise<Set<string>> {
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        origin: 'FIXED',
        status: 'CONFIRMED',
        fixedPeriod: { gte: toDbPeriod(periodOf(today)) },
      },
      select: { fixedId: true, fixedPeriod: true },
    });
    return new Set(
      rows.map((r) => `${r.fixedId}|${r.fixedPeriod ? utcToPeriod(r.fixedPeriod) : ''}`),
    );
  }
}
