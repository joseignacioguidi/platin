import { z } from 'zod';
import { instrumentSchema, pocketSchema } from './accounts';
import { currencySchema, localDateSchema, nonNegativeAmountSchema, uuidSchema } from './common';

export const valuationSchema = z.object({
  id: uuidSchema,
  pocketId: uuidSchema,
  date: z.string(),
  value: z.string(),
  /** Signed yield it recorded ("0.00" when the value matched the balance). */
  yield: z.string(),
  /** The YIELD movement it created (null when the difference was 0). */
  transactionId: uuidSchema.nullable(),
});

const summarySchema = z.object({
  /** Initial balance + transfers in − transfers out. */
  invested: z.string(),
  value: z.string(),
  /** Sum of its yields (signed). */
  yield: z.string(),
  /** yield / invested as a ratio with 4 decimals ("0.0800"); null without money invested. */
  yieldRate: z.string().nullable(),
  /** Yield of the last valuation. */
  lastYield: z.string(),
});

export const investmentPocketSchema = pocketSchema.extend({
  summary: summarySchema,
  lastValuation: valuationSchema.nullable(),
});

const totalsSchema = z.object({ invested: z.string(), value: z.string(), yield: z.string() });

/** INV-05: GET /investments. */
export const investmentsSchema = z.object({
  accounts: z.array(
    z.object({ id: uuidSchema, name: z.string(), pockets: z.array(investmentPocketSchema) }),
  ),
  totals: z.object({ ARS: totalsSchema, USD: totalsSchema }),
  /** Everything valued in the base currency with the preferred rate of today. */
  base: z.object({
    currency: currencySchema,
    invested: z.string(),
    value: z.string(),
    yield: z.string(),
    yieldRate: z.string().nullable(),
    /** Composition by instrument, biggest first. */
    byInstrument: z.array(z.object({ instrument: instrumentSchema, value: z.string() })),
  }),
  /** Date of the last valuation of any investment (null if none). */
  lastValuationDate: z.string().nullable(),
  /** INV-03: more than a month since the last update (or since the oldest investment). */
  overdue: z.boolean(),
});

/** INV-03/04: the current value of several investments in one go. */
export const createValuationsRequestSchema = z.object({
  items: z
    .array(
      z.object({ pocketId: uuidSchema, date: localDateSchema, value: nonNegativeAmountSchema }),
    )
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.pocketId)).size === items.length, {
      message: 'Cada inversión va una sola vez',
    }),
});

export const valuationsResponseSchema = z.object({ items: z.array(valuationSchema) });

export type Valuation = z.infer<typeof valuationSchema>;
export type InvestmentPocket = z.infer<typeof investmentPocketSchema>;
export type Investments = z.infer<typeof investmentsSchema>;
export type CreateValuationsRequest = z.infer<typeof createValuationsRequestSchema>;
export type ValuationsResponse = z.infer<typeof valuationsResponseSchema>;
