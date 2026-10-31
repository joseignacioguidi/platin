import { AccountKind, InstrumentType, PocketKind } from '@platin/domain';
import { z } from 'zod';
import { transactionSchema } from './transactions';
import {
  currencyAmountSchema,
  currencySchema,
  localDateSchema,
  nonNegativeAmountSchema,
  rateSchema,
  signedAmountSchema,
  uuidSchema,
} from './common';

export const accountKindSchema = z.enum([
  AccountKind.BANK,
  AccountKind.WALLET,
  AccountKind.CASH,
  AccountKind.BROKER,
]);

export const pocketKindSchema = z.enum([
  PocketKind.AVAILABLE,
  PocketKind.SAVINGS,
  PocketKind.INVESTMENT,
]);

export const instrumentSchema = z.enum([
  InstrumentType.CEDEAR,
  InstrumentType.STOCK,
  InstrumentType.MUTUAL_FUND,
  InstrumentType.TERM_DEPOSIT,
  InstrumentType.CRYPTO,
  InstrumentType.OTHER,
]);

/** Design token names an account or category can be painted with (never raw hex). */
export const colorTokenSchema = z.enum([
  'brand',
  'expense',
  'pending',
  'transfer',
  'card',
  'savings',
  'muted',
]);

/** One line per currency in use (MON-03). */
const totalsSchema = z.array(currencyAmountSchema);

const nameSchema = z.string().trim().min(1, 'Ingresá un nombre').max(60);

// ---------- Pockets ----------

/** CTA-02: money set apart inside an account, in one currency. */
export const createPocketRequestSchema = z
  .object({
    name: nameSchema,
    kind: pocketKindSchema,
    currency: currencySchema,
    /** Required for investment pockets, absent otherwise. */
    instrument: instrumentSchema.nullable().default(null),
    initialBalance: nonNegativeAmountSchema.default('0'),
    includeInNetWorth: z.boolean().default(true),
  })
  .refine((p) => (p.kind === 'INVESTMENT') === (p.instrument !== null), {
    message: 'Elegí el instrumento de la inversión',
    path: ['instrument'],
  });

export const updatePocketRequestSchema = z
  .object({
    name: nameSchema,
    kind: pocketKindSchema,
    instrument: instrumentSchema.nullable(),
    includeInNetWorth: z.boolean(),
    archived: z.boolean(),
  })
  .partial();

export const pocketSchema = z.object({
  id: uuidSchema,
  accountId: uuidSchema,
  accountName: z.string(),
  name: z.string(),
  kind: pocketKindSchema,
  currency: currencySchema,
  instrument: instrumentSchema.nullable(),
  initialBalance: z.string(),
  includeInNetWorth: z.boolean(),
  archived: z.boolean(),
  /** Calculated: initial + confirmed movements ± adjustments ± yields ± transfers. */
  balance: z.string(),
});

// ---------- Accounts ----------

/** CTA-01: an institution or place. It is created with its "Disponible" pocket in pesos. */
export const createAccountRequestSchema = z.object({
  name: nameSchema,
  kind: accountKindSchema,
  color: colorTokenSchema.nullable().default(null),
  /** Today's balance of its "Disponible" pocket (ARS). */
  initialBalance: nonNegativeAmountSchema.default('0'),
});

export const updateAccountRequestSchema = z
  .object({
    name: nameSchema,
    kind: accountKindSchema,
    color: colorTokenSchema.nullable(),
    archived: z.boolean(),
  })
  .partial();

export const accountSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: accountKindSchema,
  color: colorTokenSchema.nullable(),
  archived: z.boolean(),
  /** Active pockets (all of them with ?archived=true). */
  pockets: z.array(pocketSchema),
  /** Sum of its active pockets per currency. */
  totals: totalsSchema,
});

export const accountsResponseSchema = z.object({
  items: z.array(accountSchema),
  /** Sum per currency of the active pockets that count for net worth. */
  totals: totalsSchema,
  /**
   * Those totals valued in the base currency with today's rates (dollar of the preferred type,
   * the rest oficial); null when some currency has no known rate yet.
   */
  totalBase: currencyAmountSchema.nullable(),
});

/** CTA-06: the real balance of a pocket; the API records the difference as an adjustment. */
export const adjustBalanceRequestSchema = z.object({
  balance: signedAmountSchema,
  date: localDateSchema,
  /** Pesos per unit of the pocket's currency; without it, the rate of the day is used. */
  exchangeRate: rateSchema.optional(),
});

/** The adjustment movement, or null when the balance already matched. */
export const adjustBalanceResponseSchema = z.object({ adjustment: transactionSchema.nullable() });

export type AccountKindValue = z.infer<typeof accountKindSchema>;
export type PocketKindValue = z.infer<typeof pocketKindSchema>;
export type Instrument = z.infer<typeof instrumentSchema>;
export type ColorToken = z.infer<typeof colorTokenSchema>;
export type CreatePocketRequest = z.input<typeof createPocketRequestSchema>;
export type UpdatePocketRequest = z.infer<typeof updatePocketRequestSchema>;
export type Pocket = z.infer<typeof pocketSchema>;
export type CreateAccountRequest = z.input<typeof createAccountRequestSchema>;
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type AdjustBalanceRequest = z.infer<typeof adjustBalanceRequestSchema>;
export type AdjustBalanceResponse = z.infer<typeof adjustBalanceResponseSchema>;
