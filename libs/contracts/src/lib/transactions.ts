import { TxOrigin, TxStatus, TxType } from '@platin/domain';
import { z } from 'zod';
import { amountSchema, currencySchema, localDateSchema, rateSchema, uuidSchema } from './common';

export const txTypeSchema = z.enum([TxType.INCOME, TxType.EXPENSE, TxType.ADJUSTMENT]);
export const txStatusSchema = z.enum([TxStatus.PENDING, TxStatus.CONFIRMED]);
export const txOriginSchema = z.enum([TxOrigin.MANUAL, TxOrigin.FIXED, TxOrigin.ADJUSTMENT]);

/** MOV-01: an income or expense on an account, in the account currency. */
export const createTransactionRequestSchema = z.object({
  type: z.enum([TxType.INCOME, TxType.EXPENSE]),
  accountId: uuidSchema,
  categoryId: uuidSchema,
  amount: amountSchema,
  date: localDateSchema,
  description: z.string().trim().max(120).optional(),
  /** ARS per USD, required when the account is not in the base currency (until phase 6). */
  exchangeRate: rateSchema.optional(),
});

export const updateTransactionRequestSchema = z
  .object({
    accountId: uuidSchema,
    categoryId: uuidSchema,
    amount: amountSchema,
    date: localDateSchema,
    description: z.string().trim().max(120).nullable(),
    exchangeRate: rateSchema,
  })
  .partial();

/** MOV-05: confirm pending movements in batch, optionally fixing the amount. */
export const confirmTransactionsRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: uuidSchema,
        amount: amountSchema.optional(),
        /** ARS per USD, for pending movements in another currency (until phase 6). */
        exchangeRate: rateSchema.optional(),
      }),
    )
    .min(1)
    .max(100),
});

export const transactionSchema = z.object({
  id: uuidSchema,
  type: txTypeSchema,
  status: txStatusSchema,
  origin: txOriginSchema,
  accountId: uuidSchema,
  categoryId: uuidSchema.nullable(),
  amount: z.string(),
  currency: currencySchema,
  rateToBase: z.string(),
  baseAmount: z.string(),
  date: z.string(),
  description: z.string().nullable(),
});

export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;
export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>;
export type ConfirmTransactionsRequest = z.infer<typeof confirmTransactionsRequestSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
