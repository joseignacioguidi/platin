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

/** DAS-01: "Libre este mes" and what surrounds it, all in base currency. */
export const dashboardSchema = z.object({
  period: z.string(),
  currency: baseCurrencySchema,
  /** Fixed incomes of the month + other confirmed incomes. */
  expectedIncome: z.string(),
  /** Confirmed expenses + card purchases of the month. */
  spent: z.string(),
  /** Still to pay this month, by the rule of Compromisos (COM-02): pending part of statements due, unconfirmed fixed expenses (pocket or card) and scheduled expenses. */
  committed: z.string(),
  /** DAS-05: set apart this month to savings or investments, minus what came back (can be negative). */
  separated: z.string(),
  /** expectedIncome − committed − spent − separated (can be negative). */
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
