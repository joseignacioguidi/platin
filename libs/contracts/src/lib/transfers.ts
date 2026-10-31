import { TransferIntent } from '@platin/domain';
import { z } from 'zod';
import { amountSchema, currencySchema, localDateSchema, uuidSchema } from './common';

export const transferIntentSchema = z.enum([
  TransferIntent.SAVE,
  TransferIntent.INVEST,
  TransferIntent.REDEEM,
  TransferIntent.MOVE,
]);

/**
 * MOV-02 / CTA-05: money between two pockets, of the same account or of another one. Buying
 * dollars is a transfer from a peso pocket to a dollar pocket; the rate is the one implied by
 * the two amounts.
 */
export const createTransferRequestSchema = z
  .object({
    fromPocketId: uuidSchema,
    toPocketId: uuidSchema,
    amountOut: amountSchema,
    /** Required when the pockets have different currencies; otherwise equals amountOut. */
    amountIn: amountSchema.optional(),
    date: localDateSchema,
    description: z.string().trim().max(120).optional(),
    /**
     * Quick actions (Apartar, Invertir, Rescatar) send theirs and the API checks the
     * destination fits; the intent shown is always derived from the pockets' kinds.
     */
    intent: transferIntentSchema.optional(),
  })
  .refine((t) => t.fromPocketId !== t.toPocketId, {
    message: 'Elegí dos apartados distintos',
    path: ['toPocketId'],
  });

export const transferSchema = z.object({
  id: uuidSchema,
  fromPocketId: uuidSchema,
  toPocketId: uuidSchema.nullable(),
  /** Only for transfers between pockets (null for statement payments). */
  intent: transferIntentSchema.nullable(),
  statementId: uuidSchema.nullable(),
  amountOut: z.string(),
  currencyOut: currencySchema,
  amountIn: z.string(),
  currencyIn: currencySchema,
  /**
   * When the currencies differ: pesos per unit of the other currency, or (between two others)
   * units received per unit sent.
   */
  impliedRate: z.string().nullable(),
  date: z.string(),
  description: z.string().nullable(),
});

export type CreateTransferRequest = z.infer<typeof createTransferRequestSchema>;
export type Transfer = z.infer<typeof transferSchema>;
