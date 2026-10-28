import { z } from 'zod';
import { currencySchema, periodSchema, rateTypeSchema, uuidSchema } from './common';

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
]);

/** DAS-01: "Libre este mes" and what surrounds it, all in base currency. */
export const dashboardSchema = z.object({
  period: z.string(),
  currency: currencySchema,
  /** Fixed incomes of the month + other confirmed incomes. */
  expectedIncome: z.string(),
  /** Confirmed expenses + card purchases of the month. */
  spent: z.string(),
  /** Still to pay this month: installments of unpaid statements due and unconfirmed fixed expenses. */
  committed: z.string(),
  /** expectedIncome − committed − spent (can be negative). */
  free: z.string(),
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
