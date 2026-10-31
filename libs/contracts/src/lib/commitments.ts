import { z } from 'zod';
import { currencySchema } from './common';

const totalsSchema = z.object({ ARS: z.string(), USD: z.string(), base: z.string() });

export const commitmentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('INSTALLMENT'),
    date: z.string(),
    amount: z.string(),
    currency: currencySchema,
    description: z.string(),
    cardName: z.string(),
    number: z.number().int(),
    count: z.number().int(),
  }),
  z.object({
    type: z.literal('FIXED'),
    date: z.string(),
    amount: z.string(),
    currency: currencySchema,
    name: z.string(),
  }),
]);

export const monthCommitmentsSchema = z.object({
  period: z.string(),
  committed: totalsSchema,
  expectedIncome: totalsSchema,
  /** expectedIncome.base − committed.base. */
  free: z.string(),
  items: z.array(commitmentItemSchema),
});

/** COM-01/02: next months, by currency and valued in base currency. */
export const commitmentsResponseSchema = z.object({
  baseCurrency: currencySchema,
  /** ARS per USD used for the base values; null when no rate is known yet (USD not valued). */
  rate: z.string().nullable(),
  months: z.array(monthCommitmentsSchema),
});

export const commitmentsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(12),
});

/** What POST /sync did (it is safe to call it any number of times). */
export const syncResponseSchema = z.object({
  generatedPending: z.number().int(),
  /** One-payment charges loaded by fixed items on a card (TAR-09). */
  generatedCharges: z.number().int(),
  createdStatements: z.number().int(),
  pendingCount: z.number().int(),
});

export type CommitmentItem = z.infer<typeof commitmentItemSchema>;
export type MonthCommitments = z.infer<typeof monthCommitmentsSchema>;
export type CommitmentsResponse = z.infer<typeof commitmentsResponseSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
