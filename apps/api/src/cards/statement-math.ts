import type { StatementSummary } from '@platin/contracts';
import { Currency, Money, utcToPeriod } from '@platin/domain';
import { date, DecimalLike } from '../common/serialize';
import type { StatementStatus } from '../generated/prisma/client';

export interface StatementRowWithParts {
  id: string;
  cardId: string;
  period: Date;
  closingDate: Date;
  dueDate: Date;
  status: StatementStatus;
  bankTotalArs: DecimalLike | null;
  bankTotalUsd: DecimalLike | null;
  installments: { amount: DecimalLike; currency: Currency }[];
  adjustments: { amount: DecimalLike; currency: Currency }[];
  payments: { amountIn: DecimalLike; currencyIn: Currency }[];
}

export interface StatementTotals {
  totals: Record<Currency, Money>;
  paid: Record<Currency, Money>;
  pending: Record<Currency, Money>;
}

const sum = (items: { amount: DecimalLike; currency: Currency }[], currency: Currency) =>
  Money.sum(
    items
      .filter((i) => i.currency === currency)
      .map((i) => Money.of(i.amount.toFixed(2), currency)),
    currency,
  );

/** Totals are calculated: installments + adjustments, per currency; pending = totals − paid. */
export function statementTotals(row: StatementRowWithParts): StatementTotals {
  const parts = [...row.installments, ...row.adjustments];
  const payments = row.payments.map((p) => ({ amount: p.amountIn, currency: p.currencyIn }));
  const totals = { ARS: sum(parts, 'ARS'), USD: sum(parts, 'USD') };
  const paid = { ARS: sum(payments, 'ARS'), USD: sum(payments, 'USD') };
  const pending = {
    ARS: totals.ARS.subtract(paid.ARS).max(Money.zero('ARS')),
    USD: totals.USD.subtract(paid.USD).max(Money.zero('USD')),
  };
  return { totals, paid, pending };
}

/** Status after a payment: paid when nothing is pending in either currency. */
export function statusAfterPayment(totals: StatementTotals): StatementStatus {
  return totals.pending.ARS.isZero() && totals.pending.USD.isZero() ? 'PAID' : 'PARTIALLY_PAID';
}

export function toStatementSummary(row: StatementRowWithParts): StatementSummary {
  const t = statementTotals(row);
  const pair = (m: Record<Currency, Money>) => ({ ARS: m.ARS.toString(), USD: m.USD.toString() });
  return {
    id: row.id,
    cardId: row.cardId,
    period: utcToPeriod(row.period),
    closingDate: date(row.closingDate),
    dueDate: date(row.dueDate),
    status: row.status,
    totals: pair(t.totals),
    paid: pair(t.paid),
    pending: pair(t.pending),
    bankTotalArs: row.bankTotalArs ? row.bankTotalArs.toFixed(2) : null,
    bankTotalUsd: row.bankTotalUsd ? row.bankTotalUsd.toFixed(2) : null,
  };
}

/** Include clause to load what statementTotals needs. */
export const STATEMENT_PARTS = {
  installments: { select: { amount: true, currency: true } },
  adjustments: { select: { amount: true, currency: true } },
  payments: { select: { amountIn: true, currencyIn: true } },
} as const;
