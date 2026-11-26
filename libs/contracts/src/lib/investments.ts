import { z } from 'zod';
import { instrumentSchema, pocketSchema } from './accounts';
import {
  amountSchema,
  baseCurrencySchema,
  currencySchema,
  localDateSchema,
  nonNegativeAmountSchema,
  uuidSchema,
} from './common';

export const valuationSchema = z.object({
  id: uuidSchema,
  pocketId: uuidSchema,
  date: z.string(),
  value: z.string(),
  /** AUTO: the month-end valuation of an investment with an automatic value (INV-11). */
  source: z.enum(['MANUAL', 'AUTO']),
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

/** Nominal annual rate as a ratio with up to 6 decimals ("0.30" = 30 %), below 1000 %. */
export const tnaSchema = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,6})?$/, 'Ingresá una tasa válida');

/** INV-12: PUT /pockets/:id/term-deposit. The API checks the dates (TERM_DEPOSIT_DATES). */
export const termDepositRequestSchema = z.object({
  principal: amountSchema,
  tna: tnaSchema,
  startDate: localDateSchema,
  endDate: localDateSchema,
});

export const termDepositSchema = z.object({
  principal: z.string(),
  tna: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  /** From the end date on, until it is redeemed ("Vencido"). */
  matured: z.boolean(),
  /** Everything was taken out. */
  redeemed: z.boolean(),
});

/** An instrument of the shared catalog (iteration 15). */
export const listingSchema = z.object({
  id: uuidSchema,
  symbol: z.string(),
  name: z.string(),
  type: instrumentSchema,
  currency: currencySchema,
});

export const pricingModeSchema = z.enum(['MANUAL', 'MARKET', 'TERM_DEPOSIT']);

/**
 * INV-08 / INV-12: how the investment is valued now. MANUAL repeats the summary; MARKET is
 * units × last price; TERM_DEPOSIT is calculated from its terms. None of them creates movements.
 */
export const pricingSchema = z.object({
  mode: pricingModeSchema,
  /** MARKET: the units it has. */
  units: z.string().nullable(),
  /** MARKET: the last stored price (null if there is none yet). */
  price: z.string().nullable(),
  priceDate: z.string().nullable(),
  /** MARKET: the price could not be refreshed and the last stored one is used. */
  stale: z.boolean(),
  /** The value the totals use. */
  marketValue: z.string(),
  /** marketValue − invested (signed). */
  liveYield: z.string(),
  liveYieldRate: z.string().nullable(),
  /** MARKET: the linked instrument. */
  listing: listingSchema.nullable(),
  /** TERM_DEPOSIT: its terms and state. */
  termDeposit: termDepositSchema.nullable(),
});

export const investmentPocketSchema = pocketSchema.extend({
  summary: summarySchema,
  pricing: pricingSchema,
  lastValuation: valuationSchema.nullable(),
});

const totalsSchema = z.object({ invested: z.string(), value: z.string(), yield: z.string() });

/** INV-05: GET /investments. */
export const investmentsSchema = z.object({
  accounts: z.array(
    z.object({ id: uuidSchema, name: z.string(), pockets: z.array(investmentPocketSchema) }),
  ),
  /** One line per currency with investments (MON-03). */
  totals: z.array(totalsSchema.extend({ currency: currencySchema })),
  /** Everything valued in the base currency with today's rates. */
  base: z.object({
    currency: baseCurrencySchema,
    invested: z.string(),
    value: z.string(),
    yield: z.string(),
    yieldRate: z.string().nullable(),
    /** Composition by instrument, biggest first. */
    byInstrument: z.array(z.object({ instrument: instrumentSchema, value: z.string() })),
  }),
  /** Date of the last valuation of any investment (null if none). */
  lastValuationDate: z.string().nullable(),
  /** INV-03: more than a month since the last update (or since the oldest investment). Only manual ones count. */
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
export type TermDepositRequest = z.infer<typeof termDepositRequestSchema>;
export type TermDeposit = z.infer<typeof termDepositSchema>;
export type Listing = z.infer<typeof listingSchema>;
export type Pricing = z.infer<typeof pricingSchema>;
export type PricingMode = z.infer<typeof pricingModeSchema>;

/** Units (CEDEARs, shares, fund units, coins): up to 16 digits and 8 decimals. */
export const unitsSchema = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,8})?$/, 'Ingresá una cantidad válida');

/** Positive units: what a transfer or a correction moves. */
export const positiveUnitsSchema = unitsSchema.refine(
  (value) => /[1-9]/.test(value),
  'La cantidad tiene que ser mayor a cero',
);

/** INV-07: GET /instruments?type=&q= searches the shared catalog. */
export const instrumentsQuerySchema = z.object({
  type: instrumentSchema,
  q: z.string().trim().max(60).default(''),
});

export const instrumentsResponseSchema = z.object({
  items: z.array(listingSchema),
  /** False when no price source covers the type: it can only go by hand. */
  priced: z.boolean(),
});

/** INV-07: PUT /pockets/:id/holding links (or relinks) an investment to an instrument. */
export const holdingRequestSchema = z.object({
  instrumentId: uuidSchema,
  /** The units it already had when it was linked. */
  initialUnits: unitsSchema,
});

export const holdingDirectionSchema = z.enum(['IN', 'OUT']);

/** INV-10: a correction of units without moving money. */
export const holdingAdjustmentRequestSchema = z.object({
  date: localDateSchema,
  units: positiveUnitsSchema,
  direction: holdingDirectionSchema,
  note: z.string().trim().max(120).optional(),
});

export const holdingAdjustmentSchema = z.object({
  id: uuidSchema,
  pocketId: uuidSchema,
  date: z.string(),
  units: z.string(),
  direction: holdingDirectionSchema,
  note: z.string().nullable(),
});

export const holdingAdjustmentsResponseSchema = z.object({
  items: z.array(holdingAdjustmentSchema),
});

export type InstrumentsQuery = z.infer<typeof instrumentsQuerySchema>;
export type InstrumentsResponse = z.infer<typeof instrumentsResponseSchema>;
export type HoldingRequest = z.infer<typeof holdingRequestSchema>;
export type HoldingAdjustmentRequest = z.infer<typeof holdingAdjustmentRequestSchema>;
export type HoldingAdjustment = z.infer<typeof holdingAdjustmentSchema>;
export type HoldingAdjustmentsResponse = z.infer<typeof holdingAdjustmentsResponseSchema>;
