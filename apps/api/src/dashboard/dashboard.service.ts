import { Injectable } from '@nestjs/common';
import type {
  ColorToken,
  Dashboard,
  DashboardAccount,
  DashboardUnassigned,
  ToPayItem,
  UpcomingItem,
} from '@platin/contracts';
import {
  accountCoverage,
  addDays,
  CommitmentItem,
  daysLeftIn,
  freePerDay,
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
  RateTable,
  RateType,
  SavedTransfer,
  savedThisMonth,
  transferBaseValue,
  utcToLocalDate,
  utcToPeriod,
  valueIn,
  canConvert,
  commitmentsByMonth,
} from '@platin/domain';
import { PocketBalancesService } from '../accounts/pocket-balances.service';
import { STATEMENT_PARTS, statementTotals } from '../cards/statement-math';
import { ClockService } from '../common/clock.service';
import { BuiltCommitments, CommitmentsInputBuilder } from '../commitments/commitments-input';
import { baseCurrency, date, money as money2, toDbDate, toDbPeriod } from '../common/serialize';
import { FIXED_INCLUDE, FixedRow, toSchedule } from '../fixed/fixed.mapper';
import type { Prisma } from '../generated/prisma/client';
import { InvestmentsService } from '../investments/investments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { UserRates } from '../rates/user-rates.service';

const UPCOMING_DAYS = 30;
/** DAS-07: the next payments each account shows. */
const NEXT_PAYMENTS = 3;

interface AccountInfo {
  name: string;
  sortOrder: number;
}

const STATEMENT_WITH_CARD = { ...STATEMENT_PARTS, card: { select: { name: true } } } as const;
type StatementRow = Prisma.CardStatementGetPayload<{ include: typeof STATEMENT_WITH_CARD }>;

/**
 * DAS-01 / DAS-05 (iteration 6). All amounts in base currency, with today's rate:
 * - in your accounts = balance of the account balances and spending reserves (today, or on the
 *   last day of a previous month);
 * - to collect = unconfirmed fixed incomes of the month + scheduled incomes (MOV-08);
 * - to pay = what is still to pay this month, with the rule and input of Compromisos
 *   (commitmentsByMonth);
 * - free = in your accounts + to collect − to pay (card installments due after the month are
 *   left out, ADR 0029). A previous month only has the first part;
 * - spent and saved are shown as data apart.
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
    private readonly balances: PocketBalancesService,
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

    const past = compareDates(period, periodOf(today)) < 0;
    const [
      spendable,
      expenses,
      incomes,
      charges,
      fixedItems,
      monthFixedTx,
      statements,
      pending,
      built,
    ] = await Promise.all([
      this.prisma.pocket.findMany({
        where: { userId, kind: { in: ['AVAILABLE', 'SPENDING'] }, archivedAt: null },
        include: { account: { select: { name: true, sortOrder: true } } },
      }),
      this.prisma.transaction.aggregate({
        where: { userId, date: range, status: 'CONFIRMED', type: 'EXPENSE' },
        _sum: { baseAmount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { userId, date: range, status: 'CONFIRMED', type: 'INCOME' },
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

    const balances = await this.balances.balances(
      userId,
      spendable,
      past ? lastDayOf(period) : undefined,
    );
    const inAccounts = Money.sum([...balances.values()].map(toBase), base);

    // Fixed incomes of the month not confirmed yet: the pending movement's amount, else the
    // expected one.
    let fixedIncome = Money.zero(base);
    for (const fixed of fixedItems.filter((f) => f.kind === 'INCOME')) {
      for (const due of duePeriods(toSchedule(fixed), period, period)) {
        const tx = monthFixedTx.find((t) => t.fixedId === fixed.id);
        if (tx?.status === 'CONFIRMED') continue;
        fixedIncome = fixedIncome.add(
          toBase(tx ? Money.of(tx.amount.toFixed(2), tx.currency) : due.amount),
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
    const zero = Money.zero(base);
    const toCollect = past ? zero : fixedIncome.add(scheduledIncome);
    const toPay = past ? zero : month.committed.base;
    const spent = money(expenses._sum.baseAmount).add(cardSpent);
    const saved = await this.saved(userId, base, user.valuationRate, range);
    const free = freeThisMonth({ inAccounts, toCollect, toPay });

    // DAS-07: the same items as "to pay", split by the account they are paid from.
    const toPayItems = past ? [] : month.items.map((item) => this.toPayItem(item, built));
    const { accounts, unassigned } = past
      ? { accounts: [], unassigned: null }
      : await this.accountPayments(userId, spendable, balances, toPayItems, toBase, todayRates);

    return {
      period,
      currency: base,
      inAccounts: inAccounts.toString(),
      toCollect: toCollect.toString(),
      toPay: toPay.toString(),
      free: free.toString(),
      spent: spent.toString(),
      saved: saved.toString(),
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
      perDay: freePerDay(free, today, period)?.toString() ?? null,
      daysLeft: daysLeftIn(period, today),
      received: money(incomes._sum.baseAmount).toString(),
      accounts,
      unassigned,
      toPayItems,
    };
  }

  /** A line of "to pay this month" with where it is paid from (COM-04). */
  private toPayItem(item: CommitmentItem, built: BuiltCommitments): ToPayItem {
    const common = {
      date: item.date,
      amount: item.amount.toString(),
      currency: item.amount.currency,
    };
    if (item.type === 'STATEMENT') {
      return {
        ...common,
        type: 'STATEMENT',
        id: item.statementId,
        cardId: item.cardId,
        name: built.cardNames.get(item.cardId) ?? '',
        payFrom: built.cardPayers.get(item.cardId) ?? null,
      };
    }
    if (item.type === 'FIXED') {
      return {
        ...common,
        type: 'FIXED',
        id: item.fixedId,
        cardId: item.cardId,
        name: item.name,
        payFrom: item.cardId
          ? (built.cardPayers.get(item.cardId) ?? null)
          : (built.fixedPayers.get(item.fixedId) ?? null),
      };
    }
    return {
      ...common,
      type: 'SCHEDULED',
      id: item.scheduledId,
      cardId: null,
      name: item.description,
      payFrom: built.scheduled.get(item.scheduledId)?.payFrom ?? null,
    };
  }

  /**
   * DAS-07, per account and currency: what it has to spend (balance + spending reserves) and what
   * it still pays this month, the items of its payment pockets valued in its currency with today's
   * rate (ADR 0025). An item in a currency that can't be converted stays in its own currency.
   * What has no payment account goes apart, in base currency.
   */
  private async accountPayments(
    userId: string,
    spendable: { id: string; accountId: string; currency: Currency; account: AccountInfo }[],
    balances: Map<string, Money>,
    items: ToPayItem[],
    toBase: (money: Money) => Money,
    rates: RateTable,
  ): Promise<{ accounts: DashboardAccount[]; unassigned: DashboardUnassigned | null }> {
    const payerIds = [
      ...new Set(items.flatMap((item) => (item.payFrom ? [item.payFrom.pocketId] : []))),
    ];
    const payers = new Map(
      (
        await this.prisma.pocket.findMany({
          where: { userId, id: { in: payerIds } },
          select: {
            id: true,
            accountId: true,
            currency: true,
            account: { select: { name: true, sortOrder: true } },
          },
        })
      ).map((pocket) => [pocket.id, pocket]),
    );

    interface Row {
      accountId: string;
      account: AccountInfo;
      currency: Currency;
      spendable: Money;
      toPay: Money;
      items: ToPayItem[];
    }
    const rows = new Map<string, Row>();
    const row = (accountId: string, account: AccountInfo, currency: Currency): Row => {
      const key = `${accountId}|${currency}`;
      let found = rows.get(key);
      if (!found) {
        found = {
          accountId,
          account,
          currency,
          spendable: Money.zero(currency),
          toPay: Money.zero(currency),
          items: [],
        };
        rows.set(key, found);
      }
      return found;
    };
    for (const pocket of spendable) {
      const target = row(pocket.accountId, pocket.account, pocket.currency);
      target.spendable = target.spendable.add(
        balances.get(pocket.id) ?? Money.zero(pocket.currency),
      );
    }

    const unassignedItems: ToPayItem[] = [];
    let unassignedTotal: Money | null = null;
    for (const item of items) {
      const amount = Money.of(item.amount, item.currency as Currency);
      const payer = item.payFrom ? payers.get(item.payFrom.pocketId) : undefined;
      if (!payer) {
        unassignedItems.push(item);
        const value = toBase(amount);
        unassignedTotal = unassignedTotal ? unassignedTotal.add(value) : value;
        continue;
      }
      const convertible = canConvert(amount.currency, payer.currency, rates);
      const target = row(
        payer.accountId,
        payer.account,
        convertible ? payer.currency : amount.currency,
      );
      target.toPay = target.toPay.add(
        convertible ? valueIn(amount, payer.currency, rates) : amount,
      );
      target.items.push(item);
    }

    const accounts = [...rows.values()]
      // Accounts that pay something first, then in their usual order.
      .sort(
        (a, b) =>
          Number(b.items.length > 0) - Number(a.items.length > 0) ||
          a.account.sortOrder - b.account.sortOrder ||
          a.account.name.localeCompare(b.account.name, 'es') ||
          a.currency.localeCompare(b.currency),
      )
      .map((r) => ({
        accountId: r.accountId,
        name: r.account.name,
        currency: r.currency,
        spendable: r.spendable.toString(),
        toPay: r.toPay.toString(),
        shortfall: accountCoverage(r.spendable, r.toPay).shortfall.toString(),
        payments: r.items.slice(0, NEXT_PAYMENTS),
        paymentsCount: r.items.length,
      }));
    const unassigned = unassignedTotal
      ? {
          toPay: unassignedTotal.toString(),
          payments: unassignedItems.slice(0, NEXT_PAYMENTS),
          paymentsCount: unassignedItems.length,
        }
      : null;
    return { accounts, unassigned };
  }

  /**
   * DAS-05: transfers of the month between spendable and savings/investment pockets, valued in
   * base currency (the base side if any, else the rate of the transfer's date; ADR 0021).
   */
  private async saved(
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
    const tables = new Map<LocalDate, RateTable>();
    const items: SavedTransfer[] = [];
    for (const transfer of transfers) {
      if (!transfer.toPocket) continue;
      const out = Money.of(transfer.amountOut.toFixed(2), transfer.fromPocket.currency);
      const into = Money.of(transfer.amountIn.toFixed(2), transfer.toPocket.currency);
      let table: RateTable | undefined;
      if (out.currency !== base && into.currency !== base) {
        const day = utcToLocalDate(transfer.date);
        table = tables.get(day) ?? (await this.rates.tableFor(valuationRate, day));
        tables.set(day, table);
      }
      items.push({
        fromKind: transfer.fromPocket.kind,
        toKind: transfer.toPocket.kind,
        value: transferBaseValue(out, into, base, table),
      });
    }
    return savedThisMonth(items, base);
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
