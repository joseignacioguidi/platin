import { Injectable } from '@nestjs/common';
import type { ColorToken, CommitmentItem, CommitmentsResponse } from '@platin/contracts';
import { addMonths, commitmentsByMonth, CurrencyTotals, Money, periodOf } from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { baseCurrency, cardCurrency } from '../common/serialize';
import { CommitmentsInputBuilder } from './commitments-input';

/**
 * COM-01/02: for each of the next months, what is still pending of the unpaid statements due
 * that month, fixed expenses (on a pocket or a card) and scheduled expenses; expected income
 * from fixed and scheduled incomes. Same rule and input as the home screen.
 */
@Injectable()
export class CommitmentsService {
  constructor(
    private readonly clock: ClockService,
    private readonly builder: CommitmentsInputBuilder,
  ) {}

  async byMonth(userId: string, months: number): Promise<CommitmentsResponse> {
    const from = periodOf(this.clock.today());
    const to = addMonths(from, months - 1);
    const { input, rates, cardNames, scheduled } = await this.builder.build(userId, from, to);
    const computed = commitmentsByMonth(input, from, months);

    const totals = (t: CurrencyTotals) => ({
      byCurrency: t.byCurrency.map((m) => ({ currency: m.currency, amount: m.toString() })),
      base: t.base.toString(),
    });
    return {
      baseCurrency: baseCurrency(input.base),
      rate: rates.USD === undefined ? null : String(rates.USD),
      months: computed.map((month) => {
        const committed = totals(month.committed);
        const expectedIncome = totals(month.expectedIncome);
        return {
          period: month.period,
          committed,
          expectedIncome,
          free: Money.of(expectedIncome.base, input.base)
            .subtract(Money.of(committed.base, input.base))
            .toString(),
          items: month.items.map((item): CommitmentItem => {
            if (item.type === 'STATEMENT') {
              return {
                type: 'STATEMENT',
                date: item.date,
                amount: item.amount.toString(),
                currency: cardCurrency(item.amount.currency),
                statementId: item.statementId,
                cardName: cardNames.get(item.cardId) ?? '',
                partiallyPaid: item.partiallyPaid,
                installments: item.installments.map((i) => ({
                  description: i.description,
                  number: i.number,
                  count: i.count,
                  amount: i.amount.toString(),
                })),
              };
            }
            if (item.type === 'FIXED') {
              return {
                type: 'FIXED',
                date: item.date,
                amount: item.amount.toString(),
                currency: item.amount.currency,
                name: item.name,
                cardName: item.cardId ? (cardNames.get(item.cardId) ?? '') : null,
              };
            }
            const category = scheduled.get(item.scheduledId)?.category ?? null;
            return {
              type: 'SCHEDULED',
              date: item.date,
              amount: item.amount.toString(),
              currency: item.amount.currency,
              id: item.scheduledId,
              description: item.description,
              category: category ? { ...category, color: category.color as ColorToken } : null,
            };
          }),
        };
      }),
    };
  }
}
