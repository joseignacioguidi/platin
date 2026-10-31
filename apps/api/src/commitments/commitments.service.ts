import { Injectable } from '@nestjs/common';
import type { CommitmentItem, CommitmentsResponse } from '@platin/contracts';
import {
  addMonths,
  commitmentsByMonth,
  CurrencyTotals,
  firstDayOf,
  lastDayOf,
  Money,
  periodOf,
  RateTable,
  utcToLocalDate,
} from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { baseCurrency, cardCurrency, toDbDate } from '../common/serialize';
import { FIXED_INCLUDE, toSchedule } from '../fixed/fixed.mapper';
import { PrismaService } from '../prisma/prisma.service';

/** Supplies today's rates (pesos per unit) used to value commitments in the base currency. */
export abstract class CommitmentsRateSource {
  abstract today(userId: string): Promise<RateTable>;
}

/**
 * COM-01/02: for each of the next months, installments of unpaid statements due that month
 * plus active fixed expenses with their amount in force; expected income from fixed incomes.
 */
@Injectable()
export class CommitmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly rates: CommitmentsRateSource,
  ) {}

  async byMonth(userId: string, months: number): Promise<CommitmentsResponse> {
    const from = periodOf(this.clock.today());
    const to = addMonths(from, months - 1);
    const [user, installments, fixed, rate] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.installment.findMany({
        where: {
          statement: {
            userId,
            status: { not: 'PAID' },
            dueDate: { gte: toDbDate(firstDayOf(from)), lte: toDbDate(lastDayOf(to)) },
          },
        },
        include: {
          statement: { select: { dueDate: true, card: { select: { id: true, name: true } } } },
          charge: { select: { id: true, description: true, installmentsCount: true } },
        },
      }),
      this.prisma.fixedItem.findMany({
        where: { userId, pocketId: { not: null } },
        include: FIXED_INCLUDE,
      }),
      this.rates.today(userId),
    ]);

    const cardNames = new Map(
      installments.map((i) => [i.statement.card.id, i.statement.card.name]),
    );
    const computed = commitmentsByMonth(
      {
        base: user.baseCurrency,
        // A currency without a known rate is reported in its line but not valued in base.
        rates: rate,
        installments: installments.map((i) => ({
          chargeId: i.charge.id,
          description: i.charge.description,
          number: i.number,
          count: i.charge.installmentsCount,
          amount: Money.of(i.amount.toFixed(2), i.currency),
          cardId: i.statement.card.id,
          dueDate: utcToLocalDate(i.statement.dueDate),
        })),
        fixed: fixed.map((f) => ({ ...toSchedule(f), id: f.id, name: f.name, cardId: null })),
      },
      from,
      months,
    );

    const totals = (t: CurrencyTotals) => ({
      byCurrency: t.byCurrency.map((m) => ({ currency: m.currency, amount: m.toString() })),
      base: t.base.toString(),
    });
    return {
      baseCurrency: baseCurrency(user.baseCurrency),
      rate: rate.USD === undefined ? null : String(rate.USD),
      months: computed.map((month) => {
        const committed = totals(month.committed);
        const expectedIncome = totals(month.expectedIncome);
        return {
          period: month.period,
          committed,
          expectedIncome,
          free: Money.of(expectedIncome.base, user.baseCurrency)
            .subtract(Money.of(committed.base, user.baseCurrency))
            .toString(),
          items: month.items.map((item): CommitmentItem =>
            item.type === 'INSTALLMENT'
              ? {
                  type: 'INSTALLMENT',
                  date: item.date,
                  amount: item.amount.toString(),
                  currency: cardCurrency(item.amount.currency),
                  description: item.description,
                  cardName: cardNames.get(item.cardId) ?? '',
                  number: item.number,
                  count: item.count,
                }
              : {
                  type: 'FIXED',
                  date: item.date,
                  amount: item.amount.toString(),
                  currency: item.amount.currency,
                  name: item.name,
                },
          ),
        };
      }),
    };
  }
}
