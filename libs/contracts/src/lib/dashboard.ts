import { z } from 'zod';
import {
  baseCurrencySchema,
  currencySchema,
  periodSchema,
  rateTypeSchema,
  uuidSchema,
} from './common';
import { commitmentCategorySchema, payFromSchema } from './commitments';

export const dashboardQuerySchema = z.object({ period: periodSchema.optional() });

export const upcomingItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('STATEMENT'),
    date: z.string(),
    statementId: uuidSchema,
    cardId: uuidSchema,
    cardName: z.string(),
    ARS: z.string(),
    USD: z.string(),
  }),
  z.object({
    type: z.literal('FIXED'),
    date: z.string(),
    fixedId: uuidSchema,
    kind: z.enum(['INCOME', 'EXPENSE']),
    name: z.string(),
    pocketName: z.string(),
    accountName: z.string(),
    amount: z.string(),
    currency: currencySchema,
  }),
  /** MOV-08: a scheduled income or expense, with its category icon. */
  z.object({
    type: z.literal('SCHEDULED'),
    date: z.string(),
    id: uuidSchema,
    kind: z.enum(['INCOME', 'EXPENSE']),
    description: z.string(),
    pocketName: z.string(),
    accountName: z.string(),
    amount: z.string(),
    currency: currencySchema,
    category: commitmentCategorySchema.nullable(),
  }),
]);

/**
 * DAS-07: one line of "para pagar este mes" (a statement part per currency, a fixed expense or a
 * scheduled expense), with where it is paid from (COM-04). `id` is the statement, fixed item or
 * scheduled movement it opens.
 */
export const toPayItemSchema = z.object({
  type: z.enum(['STATEMENT', 'FIXED', 'SCHEDULED']),
  id: uuidSchema,
  /** The card of a statement or of a fixed item on a card. */
  cardId: uuidSchema.nullable(),
  date: z.string(),
  /** Card name of a statement, name of a fixed item, description of a scheduled one. */
  name: z.string(),
  amount: z.string(),
  currency: currencySchema,
  payFrom: payFromSchema,
});

/** DAS-07: the next payments of an account (or of the ones without one) and how many there are. */
const paymentsSchema = {
  /** The next 3 of the month, by date. */
  payments: z.array(toPayItemSchema),
  paymentsCount: z.number().int(),
};

/**
 * DAS-07: per account and currency, what it has to spend (balance + spending reserves), what it
 * still pays this month (in that currency, with today's rate) and what is missing to cover it.
 */
export const dashboardAccountSchema = z.object({
  accountId: uuidSchema,
  name: z.string(),
  currency: currencySchema,
  spendable: z.string(),
  toPay: z.string(),
  /** Zero when it covers its payments. */
  shortfall: z.string(),
  ...paymentsSchema,
});

/** DAS-07: what is still to pay this month without a payment account, in base currency. */
export const dashboardUnassignedSchema = z.object({ toPay: z.string(), ...paymentsSchema });

/**
 * DAS-01 / DAS-05: "Libre este mes" and how it is reached, all in base currency with today's
 * rate. For a previous month, `inAccounts` is the balance on its last day and the other three
 * parts are zero.
 */
export const dashboardSchema = z.object({
  period: z.string(),
  currency: baseCurrencySchema,
  /** Today's balance of the account balances and the spending reserves. */
  inAccounts: z.string(),
  /** Unconfirmed fixed incomes and scheduled incomes of the month. */
  toCollect: z.string(),
  /** Still to pay this month, by the rule of Compromisos (COM-02). */
  toPay: z.string(),
  /** Installments of this month's card purchases due in the following months. */
  cardLater: z.string(),
  /** inAccounts + toCollect − toPay − cardLater (can be negative). */
  free: z.string(),
  /** As data: confirmed expenses + card purchases of the month (by their total). */
  spent: z.string(),
  /** As data: saved or invested this month, minus what came back (can be negative). */
  saved: z.string(),
  pending: z.object({ count: z.number().int(), names: z.array(z.string()) }),
  /** Next 30 days: statements due and fixed items. */
  upcoming: z.array(upcomingItemSchema),
  rate: z
    .object({ type: rateTypeSchema, sell: z.string(), date: z.string(), stale: z.boolean() })
    .nullable(),
  /** INV-03: suggest updating investment values (more than a month since the last time). */
  valuationsOverdue: z.boolean(),
  /** DAS-07: free ÷ days left counting today, in whole units; null without free or in a past month. */
  perDay: z.string().nullable(),
  /** Days left in the month counting today (0 for a past month). */
  daysLeft: z.number().int(),
  /** As data: confirmed incomes of the month ("entraron"). */
  received: z.string(),
  /** Accounts with what they have to spend and pay this month (empty for a past month). */
  accounts: z.array(dashboardAccountSchema),
  /** What is to pay this month without a payment account; null when there is nothing. */
  unassigned: dashboardUnassignedSchema.nullable(),
  /** All of "para pagar este mes", by date (empty for a past month). */
  toPayItems: z.array(toPayItemSchema),
});

export type ToPayItem = z.infer<typeof toPayItemSchema>;
export type DashboardAccount = z.infer<typeof dashboardAccountSchema>;
export type DashboardUnassigned = z.infer<typeof dashboardUnassignedSchema>;
export type UpcomingItem = z.infer<typeof upcomingItemSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
