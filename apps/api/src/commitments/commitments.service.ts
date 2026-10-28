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
  utcToLocalDate,
} from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { toDbDate } from '../common/serialize';
import { FIXED_INCLUDE, toSchedule } from '../fixed/fixed.mapper';
import { PrismaService } from '../prisma/prisma.service';

/** Supplies the ARS-per-USD rate used to value commitments (phase 6 plugs in the rates module). */
export abstract class CommitmentsRateSource {
  abstract latestSell(userId: string): Promise<string | null>;
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
      this.rates.latestSell(userId),
    ]);

    const cardNames = new Map(
      installments.map((i) => [i.statement.card.id, i.statement.card.name]),
    );
    const computed = commitmentsByMonth(
      {
        base: user.baseCurrency,
        // Without a known rate, USD amounts are reported by currency but not valued in base.
        arsPerUsd: rate ?? '1',
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

    const totals = (t: CurrencyTotals) => {
      const base = rate ? t.base : t[user.baseCurrency];
      return { ARS: t.ARS.toString(), USD: t.USD.toString(), base: base.toString() };
    };
    return {
      baseCurrency: user.baseCurrency,
      rate,
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
                  currency: item.amount.currency,
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
