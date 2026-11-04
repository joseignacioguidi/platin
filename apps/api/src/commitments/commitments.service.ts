import { Injectable } from '@nestjs/common';
import type { ColorToken, CommitmentItem, CommitmentsResponse } from '@platin/contracts';
import { addMonths, commitmentsByMonth, CurrencyTotals, periodOf } from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { baseCurrency, cardCurrency } from '../common/serialize';
import { CommitmentsInputBuilder } from './commitments-input';

/**
 * COM-01/02: for each of the next months, what is still pending of the unpaid statements due
 * that month, fixed expenses (on a pocket or a card) and scheduled expenses; expected income
 * from fixed and scheduled incomes, and the margin between both. Same rule and input as the home
 * screen. COM-04: each line says where it is paid from.
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
    const { input, rates, cardNames, cardPayers, fixedPayers, scheduled } =
      await this.builder.build(userId, from, to);
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
          margin: month.margin.toString(),
          items: month.items.map((item): CommitmentItem => {
            if (item.type === 'STATEMENT') {
              return {
                type: 'STATEMENT',
                date: item.date,
                amount: item.amount.toString(),
                currency: cardCurrency(item.amount.currency),
                statementId: item.statementId,
                cardId: item.cardId,
                cardName: cardNames.get(item.cardId) ?? '',
                partiallyPaid: item.partiallyPaid,
                payFrom: cardPayers.get(item.cardId) ?? null,
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
                cardId: item.cardId,
                cardName: item.cardId ? (cardNames.get(item.cardId) ?? '') : null,
                payFrom: item.cardId
                  ? (cardPayers.get(item.cardId) ?? null)
                  : (fixedPayers.get(item.fixedId) ?? null),
              };
            }
            const info = scheduled.get(item.scheduledId);
            const category = info?.category ?? null;
            return {
              type: 'SCHEDULED',
              date: item.date,
              amount: item.amount.toString(),
              currency: item.amount.currency,
              id: item.scheduledId,
              description: item.description,
              category: category ? { ...category, color: category.color as ColorToken } : null,
              payFrom: info?.payFrom ?? null,
            };
          }),
        };
      }),
    };
  }
}
