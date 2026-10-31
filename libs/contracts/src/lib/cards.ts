import { StatementStatus } from '@platin/domain';
import { z } from 'zod';
import { colorTokenSchema } from './accounts';
import { iconNameSchema } from './categories';
import {
  amountSchema,
  cardCurrencySchema,
  currencySchema,
  localDateSchema,
  nonNegativeAmountSchema,
  periodSchema,
  uuidSchema,
} from './common';

const daySchema = z.number().int().min(1, 'Entre 1 y 31').max(31, 'Entre 1 y 31');

export const statementStatusSchema = z.enum([
  StatementStatus.OPEN,
  StatementStatus.CLOSED,
  StatementStatus.PARTIALLY_PAID,
  StatementStatus.PAID,
]);

const byCurrencySchema = z.object({ ARS: z.string(), USD: z.string() });

// ---------- Cards ----------

/** TAR-01. */
export const createCardRequestSchema = z.object({
  name: z.string().trim().min(1, 'Ingresá un nombre').max(60),
  issuer: z.string().trim().max(40).nullable().default(null),
  last4: z
    .string()
    .regex(/^\d{4}$/, 'Tienen que ser 4 números')
    .nullable()
    .default(null),
  creditLimit: amountSchema.nullable().default(null),
  closingDay: daySchema,
  dueDay: daySchema,
  defaultPaymentPocketId: uuidSchema.nullable().default(null),
});

export const updateCardRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    issuer: z.string().trim().max(40).nullable(),
    last4: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
    creditLimit: amountSchema.nullable(),
    closingDay: daySchema,
    dueDay: daySchema,
    defaultPaymentPocketId: uuidSchema.nullable(),
    archived: z.boolean(),
  })
  .partial();

/** A statement with its calculated totals (installments + adjustments) and payments. */
export const statementSummarySchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  period: z.string(),
  closingDate: z.string(),
  dueDate: z.string(),
  status: statementStatusSchema,
  totals: byCurrencySchema,
  paid: byCurrencySchema,
  /** totals − paid, never negative. */
  pending: byCurrencySchema,
  bankTotalArs: z.string().nullable(),
  bankTotalUsd: z.string().nullable(),
});

export const cardSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  issuer: z.string().nullable(),
  last4: z.string().nullable(),
  creditLimit: z.string().nullable(),
  closingDay: z.number().int(),
  dueDay: z.number().int(),
  defaultPaymentPocketId: uuidSchema.nullable(),
  archived: z.boolean(),
  /** The statement that collects today's purchases. */
  openStatement: statementSummarySchema.nullable(),
  /** Pesos still to be paid in unpaid statements (open, closed and future ones). */
  committedArs: z.string(),
  /** creditLimit − committedArs, when there is a limit. */
  available: z.string().nullable(),
});

/**
 * Without `status`: open and upcoming statements (TAR-04). With `status=closed`: the history,
 * newest first, `limit` at a time; `cursor` is the period of the last one already shown (TAR-12).
 */
export const statementsQuerySchema = z.object({
  from: periodSchema.optional(),
  to: periodSchema.optional(),
  status: z.enum(['closed']).optional(),
  cursor: periodSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// ---------- Statement detail ----------

const categoryRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  icon: iconNameSchema,
  color: colorTokenSchema,
});

export const statementInstallmentSchema = z.object({
  id: uuidSchema,
  chargeId: uuidSchema,
  description: z.string(),
  purchaseDate: z.string(),
  number: z.number().int(),
  count: z.number().int(),
  amount: z.string(),
  currency: currencySchema,
  category: categoryRefSchema,
});

export const statementAdjustmentSchema = z.object({
  id: uuidSchema,
  amount: z.string(),
  currency: currencySchema,
  description: z.string().nullable(),
  category: categoryRefSchema,
});

export const statementPaymentSchema = z.object({
  id: uuidSchema,
  date: z.string(),
  pocketName: z.string(),
  accountName: z.string(),
  amountOut: z.string(),
  currencyOut: currencySchema,
  amountIn: z.string(),
  currencyIn: currencySchema,
});

export const statementDetailSchema = statementSummarySchema.extend({
  cardName: z.string(),
  installments: z.array(statementInstallmentSchema),
  adjustments: z.array(statementAdjustmentSchema),
  payments: z.array(statementPaymentSchema),
});

// ---------- Charges and installments ----------

/**
 * TAR-02 / TAR-03: a purchase in 1 or N installments, possibly already started. The amount comes
 * as the total or as the installment the bank shows (exactly one of them); with the installment,
 * total = installment × count and every installment is exactly that.
 */
export const createChargeRequestSchema = z
  .object({
    date: localDateSchema,
    description: z.string().trim().min(1, 'Ingresá una descripción').max(120),
    categoryId: uuidSchema,
    totalAmount: amountSchema.optional(),
    installmentAmount: amountSchema.optional(),
    currency: cardCurrencySchema,
    installmentsCount: z.number().int().min(1).max(60).default(1),
    /** "Voy por la k de N": only installments k..N are generated, from the open statement. */
    startInstallment: z.number().int().min(1).default(1),
  })
  .refine((c) => c.startInstallment <= c.installmentsCount, {
    message: 'La cuota inicial no puede superar la cantidad de cuotas',
    path: ['startInstallment'],
  })
  .refine((c) => (c.totalAmount === undefined) !== (c.installmentAmount === undefined), {
    message: 'Ingresá el total o el valor de la cuota',
    path: ['totalAmount'],
  });

export const updateChargeRequestSchema = z
  .object({
    date: localDateSchema,
    description: z.string().trim().min(1).max(120),
    categoryId: uuidSchema,
    totalAmount: amountSchema,
    installmentsCount: z.number().int().min(1).max(60),
  })
  .partial();

export const chargeSchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  date: z.string(),
  description: z.string(),
  categoryId: uuidSchema,
  totalAmount: z.string(),
  currency: currencySchema,
  installmentsCount: z.number().int(),
  startInstallment: z.number().int(),
  /** Generated by a fixed item on the card (TAR-09). */
  fixedId: uuidSchema.nullable(),
  /** Some installment is in a closed statement: only description and category can change. */
  locked: z.boolean(),
  installments: z.array(
    z.object({
      number: z.number().int(),
      amount: z.string(),
      period: z.string(),
      statementId: uuidSchema,
    }),
  ),
});

/** TAR-05: a running installment plan. */
export const activeInstallmentSchema = z.object({
  chargeId: uuidSchema,
  description: z.string(),
  category: categoryRefSchema,
  currency: currencySchema,
  totalAmount: z.string(),
  count: z.number().int(),
  /** Last installment already in a closed statement ("4 de 12"). */
  current: z.number().int(),
  remainingCount: z.number().int(),
  remainingAmount: z.string(),
  /** Amount of the next installment to pay. */
  installmentAmount: z.string(),
  /** Period of the last installment: when the plan ends (COM-03). */
  lastPeriod: z.string(),
});

// ---------- Purchase history (TAR-13) ----------

/** Active: some installment still in an open statement. Finished: the last one is closed. */
export const chargeStatusSchema = z.enum(['active', 'finished']);

export const chargesQuerySchema = z
  .object({
    cardId: uuidSchema.optional(),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    query: z.string().trim().max(60).optional(),
    status: chargeStatusSchema.optional(),
    /** Opaque: the `nextCursor` of the previous page. */
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'La fecha de inicio no puede ser posterior a la de fin',
    path: ['from'],
  });

export const chargeListItemSchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  cardName: z.string(),
  date: z.string(),
  description: z.string(),
  category: categoryRefSchema,
  totalAmount: z.string(),
  currency: currencySchema,
  installmentsCount: z.number().int(),
  /** Amount of one installment (the last one may differ by cents). */
  installmentAmount: z.string(),
  /** Last installment in a closed statement ("4 de 12"); 0 = none yet. */
  current: z.number().int(),
  status: chargeStatusSchema,
  fromFixed: z.boolean(),
});

export const chargesPageSchema = z.object({
  items: z.array(chargeListItemSchema),
  nextCursor: z.string().nullable(),
});

// ---------- Close and pay ----------

/** TAR-07: the bank's totals; differences become adjustments with a category. */
export const closeStatementRequestSchema = z.object({
  bankTotalArs: nonNegativeAmountSchema.optional(),
  bankTotalUsd: nonNegativeAmountSchema.optional(),
  adjustmentCategoryId: uuidSchema.optional(),
  description: z.string().trim().max(120).optional(),
});

/** TAR-08: pay the pesos or the dollars part from a pocket. */
export const payStatementRequestSchema = z.object({
  pocketId: uuidSchema,
  /** Which part of the statement this pays. */
  currency: currencySchema,
  /** Amount of that part being paid. */
  amount: amountSchema,
  /** What leaves the pocket, when its currency differs from the part (paying dollars with pesos). */
  amountOut: amountSchema.optional(),
  date: localDateSchema,
});

export type CreateCardRequest = z.input<typeof createCardRequestSchema>;
export type UpdateCardRequest = z.infer<typeof updateCardRequestSchema>;
export type StatementSummary = z.infer<typeof statementSummarySchema>;
export type Card = z.infer<typeof cardSchema>;
export type StatementDetail = z.infer<typeof statementDetailSchema>;
export type StatementInstallment = z.infer<typeof statementInstallmentSchema>;
export type CreateChargeRequest = z.input<typeof createChargeRequestSchema>;
export type UpdateChargeRequest = z.infer<typeof updateChargeRequestSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type ActiveInstallment = z.infer<typeof activeInstallmentSchema>;
export type ChargeStatus = z.infer<typeof chargeStatusSchema>;
export type ChargesQuery = z.infer<typeof chargesQuerySchema>;
export type ChargeListItem = z.infer<typeof chargeListItemSchema>;
export type ChargesPage = z.infer<typeof chargesPageSchema>;
export type StatementsQuery = z.input<typeof statementsQuerySchema>;
export type CloseStatementRequest = z.infer<typeof closeStatementRequestSchema>;
export type PayStatementRequest = z.infer<typeof payStatementRequestSchema>;
