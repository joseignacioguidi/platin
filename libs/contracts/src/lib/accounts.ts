import { AccountType } from '@platin/domain';
import { z } from 'zod';
import { transactionSchema } from './transactions';
import {
  currencySchema,
  localDateSchema,
  nonNegativeAmountSchema,
  rateSchema,
  signedAmountSchema,
  uuidSchema,
} from './common';

export const accountTypeSchema = z.enum([
  AccountType.CASH,
  AccountType.BANK,
  AccountType.WALLET,
  AccountType.SAVINGS,
  AccountType.INVESTMENT,
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

export const createAccountRequestSchema = z.object({
  name: z.string().trim().min(1, 'Ingresá un nombre').max(60),
  type: accountTypeSchema,
  currency: currencySchema,
  initialBalance: nonNegativeAmountSchema.default('0'),
  includeInNetWorth: z.boolean().default(true),
  color: colorTokenSchema.nullable().default(null),
});

export const updateAccountRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingresá un nombre').max(60),
    type: accountTypeSchema,
    includeInNetWorth: z.boolean(),
    color: colorTokenSchema.nullable(),
    archived: z.boolean(),
  })
  .partial();

export const accountSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  type: accountTypeSchema,
  currency: currencySchema,
  initialBalance: z.string(),
  includeInNetWorth: z.boolean(),
  color: colorTokenSchema.nullable(),
  archived: z.boolean(),
  /** Calculated: initial + confirmed movements ± adjustments ± transfers. */
  balance: z.string(),
});

export const accountsResponseSchema = z.object({
  items: z.array(accountSchema),
  /** Sum of balances per currency (accounts included in net worth). */
  totals: z.object({ ARS: z.string(), USD: z.string() }),
});

/** CTA-04: the real balance; the API records the difference as an adjustment. */
export const adjustBalanceRequestSchema = z.object({
  balance: signedAmountSchema,
  date: localDateSchema,
  /** ARS per USD, required when the account is not in the base currency (until phase 6). */
  exchangeRate: rateSchema.optional(),
});

/** The adjustment movement, or null when the balance already matched. */
export const adjustBalanceResponseSchema = z.object({ adjustment: transactionSchema.nullable() });

export type AdjustBalanceResponse = z.infer<typeof adjustBalanceResponseSchema>;
export type ColorToken = z.infer<typeof colorTokenSchema>;
export type CreateAccountRequest = z.input<typeof createAccountRequestSchema>;
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type AdjustBalanceRequest = z.infer<typeof adjustBalanceRequestSchema>;
