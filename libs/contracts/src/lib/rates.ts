import { z } from 'zod';
import { rateTypeSchema } from './common';

export const exchangeRateSchema = z.object({
  type: rateTypeSchema,
  /** ARS per 1 USD. */
  buy: z.string(),
  sell: z.string(),
  /** Day the rate belongs to. */
  date: z.string(),
});

/** GET /rates/latest: the stored rate of each type, refreshed when older than an hour. */
export const latestRatesSchema = z.object({
  rates: z.array(exchangeRateSchema),
  /** True when the source didn't answer and these are the last stored values. */
  stale: z.boolean(),
  /** When the stored values were fetched (ISO date-time), null if never. */
  fetchedAt: z.string().nullable(),
});

export type ExchangeRate = z.infer<typeof exchangeRateSchema>;
export type LatestRates = z.infer<typeof latestRatesSchema>;
