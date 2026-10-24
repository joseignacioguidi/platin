import { z } from 'zod';
import { amountSchema, currencySchema, localDateSchema, uuidSchema } from './common';

/**
 * MOV-02: money between two accounts. Buying dollars is a transfer from a peso account to a
 * dollar account; the rate is the one implied by the two amounts.
 */
export const createTransferRequestSchema = z
  .object({
    fromAccountId: uuidSchema,
    toAccountId: uuidSchema,
    amountOut: amountSchema,
    /** Required when the accounts have different currencies; otherwise equals amountOut. */
    amountIn: amountSchema.optional(),
    date: localDateSchema,
    description: z.string().trim().max(120).optional(),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, {
    message: 'Elegí dos cuentas distintas',
    path: ['toAccountId'],
  });

export const transferSchema = z.object({
  id: uuidSchema,
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema.nullable(),
  statementId: uuidSchema.nullable(),
  amountOut: z.string(),
  currencyOut: currencySchema,
  amountIn: z.string(),
  currencyIn: currencySchema,
  /** ARS per USD when the currencies differ. */
  impliedRate: z.string().nullable(),
  date: z.string(),
  description: z.string().nullable(),
});

export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>;
export type Transfer = z.infer<typeof transferSchema>;
