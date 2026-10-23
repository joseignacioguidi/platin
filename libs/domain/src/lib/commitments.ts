import { addMonths, LocalDate, Period, periodOf } from './dates';
import { Currency, FixedKind } from './enums';
import { CurrencyTotals, totalsByCurrency } from './exchange';
import { DecimalInput, Money } from './money';
import { duePeriods, FixedSchedule } from './fixed';

export interface InstallmentCommitment {
  chargeId: string;
  description: string;
  number: number;
  count: number;
  amount: Money;
  cardId: string;
  /** Due date of the statement the installment belongs to. */
  dueDate: LocalDate;
}

export interface FixedCommitment extends FixedSchedule {
  id: string;
  name: string;
  /** Set for fixed items charged to a card (TAR-09): they fall into that card's statements. */
  cardId?: string | null;
}

export interface CommitmentsInput {
  /**
   * Installments of statements that are still to be paid (the caller leaves out paid statements).
   */
  installments: readonly InstallmentCommitment[];
  /** Fixed items (income and expense); paused or finished ones are handled by their schedule. */
  fixed: readonly FixedCommitment[];
  base: Currency;
  /** ARS per USD used to value everything in the base currency. */
  arsPerUsd: DecimalInput;
}

export type CommitmentItem =
  | {
      type: 'INSTALLMENT';
      date: LocalDate;
      amount: Money;
      chargeId: string;
      cardId: string;
      description: string;
      number: number;
      count: number;
    }
  | {
      type: 'FIXED';
      date: LocalDate;
      amount: Money;
      fixedId: string;
      name: string;
      cardId: string | null;
    };

export interface MonthCommitments {
  period: Period;
  /** Committed = installments due this month + active fixed expenses with their amount in force. */
  committed: CurrencyTotals;
  /** Expected fixed income. */
  expectedIncome: CurrencyTotals;
  /** Expected income − committed, in base currency. */
  free: Money;
  items: CommitmentItem[];
}

/**
 * Commitments for `months` months starting at `from`, by currency and valued in base currency.
 * Committed in month M = installments of statements due in M + fixed expenses due in M
 * (+ fixed items on a card, which are part of those statements).
 */
export function commitmentsByMonth(
  input: CommitmentsInput,
  from: Period,
  months: number,
): MonthCommitments[] {
  if (!Number.isInteger(months) || months < 1) throw new Error('months must be at least 1');
  const to = addMonths(from, months - 1);

  const fixedByPeriod = new Map<
    Period,
    { fixed: FixedCommitment; date: LocalDate; amount: Money }[]
  >();
  for (const fixed of input.fixed) {
    for (const due of duePeriods(fixed, from, to)) {
      const list = fixedByPeriod.get(due.period) ?? [];
      list.push({ fixed, date: due.date, amount: due.amount });
      fixedByPeriod.set(due.period, list);
    }
  }

  return Array.from({ length: months }, (_, i) => {
    const period = addMonths(from, i);
    const installmentItems: CommitmentItem[] = input.installments
      .filter((installment) => periodOf(installment.dueDate) === period)
      .map((installment) => ({
        type: 'INSTALLMENT',
        date: installment.dueDate,
        amount: installment.amount,
        chargeId: installment.chargeId,
        cardId: installment.cardId,
        description: installment.description,
        number: installment.number,
        count: installment.count,
      }));
    const fixedDue = fixedByPeriod.get(period) ?? [];
    const fixedItems: CommitmentItem[] = fixedDue
      .filter(({ fixed }) => fixed.kind === FixedKind.EXPENSE)
      .map(({ fixed, date, amount }) => ({
        type: 'FIXED',
        date,
        amount,
        fixedId: fixed.id,
        name: fixed.name,
        cardId: fixed.cardId ?? null,
      }));
    const incomes = fixedDue
      .filter(({ fixed }) => fixed.kind === FixedKind.INCOME)
      .map(({ amount }) => amount);

    const items = [...installmentItems, ...fixedItems].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    const committed = totalsByCurrency(
      items.map((item) => item.amount),
      input.base,
      input.arsPerUsd,
    );
    const expectedIncome = totalsByCurrency(incomes, input.base, input.arsPerUsd);
    return {
      period,
      committed,
      expectedIncome,
      free: expectedIncome.base.subtract(committed.base),
      items,
    };
  });
}

/**
 * "Libre este mes" of the home screen: expected income − committed − spent, in base currency.
 * Can be negative.
 */
export function freeThisMonth(expectedIncome: Money, committed: Money, spent: Money): Money {
  return expectedIncome.subtract(committed).subtract(spent);
}
