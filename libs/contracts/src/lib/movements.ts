import { z } from 'zod';
import { colorTokenSchema } from './accounts';
import { iconNameSchema } from './categories';
import { currencySchema, periodSchema, uuidSchema } from './common';
import { txOriginSchema, txStatusSchema, txTypeSchema } from './transactions';

const accountRefSchema = z.object({ id: uuidSchema, name: z.string(), currency: currencySchema });
const categoryRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  icon: iconNameSchema,
  color: colorTokenSchema,
});

/** An income, expense or adjustment in the unified list. */
export const transactionMovementSchema = z.object({
  kind: z.literal('TRANSACTION'),
  id: uuidSchema,
  type: txTypeSchema,
  status: txStatusSchema,
  origin: txOriginSchema,
  date: z.string(),
  amount: z.string(),
  currency: currencySchema,
  baseAmount: z.string(),
  rateToBase: z.string(),
  description: z.string().nullable(),
  account: accountRefSchema,
  category: categoryRefSchema.nullable(),
});

/** A transfer between accounts (or a statement payment, from phase 4). */
export const transferMovementSchema = z.object({
  kind: z.literal('TRANSFER'),
  id: uuidSchema,
  date: z.string(),
  amountOut: z.string(),
  currencyOut: currencySchema,
  amountIn: z.string(),
  currencyIn: currencySchema,
  impliedRate: z.string().nullable(),
  description: z.string().nullable(),
  fromAccount: accountRefSchema,
  toAccount: accountRefSchema.nullable(),
  /** Set when the transfer pays a card statement (TAR-08). */
  statement: z
    .object({ id: uuidSchema, cardId: uuidSchema, cardName: z.string(), period: z.string() })
    .nullable(),
});

/** A purchase with a credit card (its installments live in the statements). */
export const cardChargeMovementSchema = z.object({
  kind: z.literal('CARD_CHARGE'),
  id: uuidSchema,
  date: z.string(),
  description: z.string(),
  totalAmount: z.string(),
  currency: currencySchema,
  installmentsCount: z.number().int(),
  startInstallment: z.number().int(),
  card: z.object({ id: uuidSchema, name: z.string() }),
  category: categoryRefSchema,
});

export const movementSchema = z.discriminatedUnion('kind', [
  transactionMovementSchema,
  transferMovementSchema,
  cardChargeMovementSchema,
]);

export const movementFilterSchema = z.enum(['EXPENSE', 'INCOME', 'TRANSFER', 'CARD']);

/** MOV-03: `GET /movements` filters, with cursor pagination. */
export const movementsQuerySchema = z.object({
  period: periodSchema.optional(),
  accountId: uuidSchema.optional(),
  cardId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  type: movementFilterSchema.optional(),
  status: txStatusSchema.optional(),
  q: z.string().trim().max(60).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const movementsPageSchema = z.object({
  items: z.array(movementSchema),
  nextCursor: z.string().nullable(),
});

/** Income and expenses of a month, confirmed only, in base currency. */
export const movementsSummarySchema = z.object({
  period: z.string(),
  currency: currencySchema,
  income: z.string(),
  expense: z.string(),
  pendingCount: z.number().int(),
});

export const movementsSummaryQuerySchema = z.object({ period: periodSchema });

export type TransactionMovement = z.infer<typeof transactionMovementSchema>;
export type TransferMovement = z.infer<typeof transferMovementSchema>;
export type CardChargeMovement = z.infer<typeof cardChargeMovementSchema>;
export type Movement = z.infer<typeof movementSchema>;
export type MovementFilter = z.infer<typeof movementFilterSchema>;
export type MovementsQuery = z.input<typeof movementsQuerySchema>;
export type MovementsPage = z.infer<typeof movementsPageSchema>;
export type MovementsSummary = z.infer<typeof movementsSummarySchema>;
