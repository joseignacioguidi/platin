import { z } from 'zod';
import {
  baseCurrencySchema,
  currencySchema,
  periodSchema,
  rateTypeSchema,
  uuidSchema,
} from './common';
import { commitmentCategorySchema } from './commitments';

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
});

export type UpcomingItem = z.infer<typeof upcomingItemSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
