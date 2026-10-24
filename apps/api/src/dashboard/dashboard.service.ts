import { Injectable } from '@nestjs/common';
import type { Dashboard, UpcomingItem } from '@platin/contracts';
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
  utcToLocalDate,
  utcToPeriod,
  valueIn,
} from '@platin/domain';
import { STATEMENT_PARTS, statementTotals } from '../cards/statement-math';
import { ClockService } from '../common/clock.service';
import { toDbDate, toDbPeriod } from '../common/serialize';
import { FIXED_INCLUDE, FixedRow, toSchedule } from '../fixed/fixed.mapper';
import type { Prisma } from '../generated/prisma/client';
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
 * - committed = what is still to pay this month: pending part of unpaid statements due and
 *   fixed expenses not confirmed yet;
 * - free = expected − committed − spent.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly rates: RatesService,
    private readonly userRates: UserRates,
  ) {}

  async get(userId: string, requested?: Period): Promise<Dashboard> {
    const today = this.clock.today();
    const period = requested ?? periodOf(today);
    const range = { gte: toDbDate(firstDayOf(period)), lte: toDbDate(lastDayOf(period)) };
    const fresh = await this.rates.refreshIfStale();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const base = user.baseCurrency;
    const todayRate = await this.rates.rateFor(user.valuationRate, today);
    const toBase = (money: Money) =>
      money.currency === base
        ? money
        : todayRate
          ? valueIn(money, base, todayRate.sell)
          : Money.zero(base);

    const [otherIncome, expenses, charges, fixedItems, monthFixedTx, statements, pending] =
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
          where: { userId, accountId: { not: null } },
          include: FIXED_INCLUDE,
        }),
        this.prisma.transaction.findMany({
          where: { userId, origin: 'FIXED', fixedPeriod: toDbPeriod(period) },
        }),
        this.prisma.cardStatement.findMany({
          where: {
            userId,
            status: { not: 'PAID' },
            dueDate: { gte: range.gte, lte: toDbDate(addDays(today, UPCOMING_DAYS)) },
          },
          include: STATEMENT_WITH_CARD,
          orderBy: { dueDate: 'asc' },
        }),
        this.prisma.transaction.findMany({
          where: { userId, status: 'PENDING' },
          orderBy: { date: 'asc' },
          select: { description: true },
        }),
      ]);

    const money = (value: { toFixed(d: number): string } | null) =>
      Money.of((value ?? 0).toFixed(2), base);

    // Fixed items of the month: confirmed ones by their real amount, the rest by the expected one.
    let fixedIncome = Money.zero(base);
    let fixedCommitted = Money.zero(base);
    for (const fixed of fixedItems) {
      for (const due of duePeriods(toSchedule(fixed), period, period)) {
        const tx = monthFixedTx.find((t) => t.fixedId === fixed.id);
        if (fixed.kind === 'INCOME') {
          fixedIncome = fixedIncome.add(
            tx?.status === 'CONFIRMED'
              ? money(tx.baseAmount)
              : toBase(tx ? Money.of(tx.amount.toFixed(2), tx.currency) : due.amount),
          );
        } else if (tx?.status !== 'CONFIRMED') {
          fixedCommitted = fixedCommitted.add(
            toBase(tx ? Money.of(tx.amount.toFixed(2), tx.currency) : due.amount),
          );
        }
      }
    }

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

    const inPeriod = (d: Date) => utcToPeriod(d) === period;
    let statementsCommitted = Money.zero(base);
    for (const statement of statements.filter((s) => inPeriod(s.dueDate))) {
      const totals = statementTotals(statement);
      statementsCommitted = statementsCommitted
        .add(toBase(totals.pending.ARS))
        .add(toBase(totals.pending.USD));
    }

    const expectedIncome = money(otherIncome._sum.baseAmount).add(fixedIncome);
    const spent = money(expenses._sum.baseAmount).add(cardSpent);
    const committed = statementsCommitted.add(fixedCommitted);

    return {
      period,
      currency: base,
      expectedIncome: expectedIncome.toString(),
      spent: spent.toString(),
      committed: committed.toString(),
      free: freeThisMonth(expectedIncome, committed, spent).toString(),
      pending: {
        count: pending.length,
        names: pending.slice(0, 3).map((p) => p.description ?? ''),
      },
      upcoming: this.upcoming(
        today,
        statements,
        fixedItems,
        await this.confirmedFixedKeys(userId, today),
      ),
      rate: todayRate
        ? {
            type: todayRate.type,
            sell: todayRate.sell,
            date: todayRate.date,
            stale: !fresh || todayRate.date !== today,
          }
        : null,
    };
  }

  /** Statements due and fixed occurrences in the next 30 days, by date. */
  private upcoming(
    today: LocalDate,
    statements: StatementRow[],
    fixedItems: FixedRow[],
    confirmed: Set<string>,
  ): UpcomingItem[] {
    const until = addDays(today, UPCOMING_DAYS);
    const items: UpcomingItem[] = [];
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
          accountName: fixed.account?.name ?? '',
          amount: due.amount.toString(),
          currency: fixed.currency as Currency,
        });
      }
    }
    return items.sort((a, b) => compareDates(a.date as LocalDate, b.date as LocalDate));
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
