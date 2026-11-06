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

export const startStatementSchema = z.enum(['OPEN', 'PREVIOUS']);

/** TAR-03: the statement that closed and is not yet due, when today is in that window. */
export const previousStatementSchema = z.object({
  period: periodSchema,
  closingDate: z.string(),
  dueDate: z.string(),
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
  /** "Nombres para escribir" (TXT-02), normalized. */
  aliases: z.array(z.string()),
  /** The statement that collects today's purchases. */
  openStatement: statementSummarySchema.nullable(),
  /** Closed and still to be paid (TAR-03); null outside the window between closing and due date. */
  previousStatement: previousStatementSchema.nullable(),
  /** Pesos still to be paid in unpaid statements (open, closed and future ones). */
  committedArs: z.string(),
  /** creditLimit − committedArs, when there is a limit. */
  available: z.string().nullable(),
  /** "Cuotas más usadas" (TAR-02): the two counts the picker offers, lower first. */
  topInstallments: z.tuple([z.number().int(), z.number().int()]),
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
  currency: cardCurrencySchema,
  category: categoryRefSchema,
});

export const statementAdjustmentSchema = z.object({
  id: uuidSchema,
  amount: z.string(),
  currency: cardCurrencySchema,
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
    /** Where the first generated installment goes: the open statement or the one closed and unpaid. */
    startStatement: startStatementSchema.default('OPEN'),
  })
  .refine((c) => c.startStatement === 'OPEN' || c.startInstallment > 1, {
    message: 'Solo una compra ya empezada puede ir al resumen anterior',
    path: ['startStatement'],
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
    startStatement: startStatementSchema,
  })
  .partial();

export const chargeSchema = z.object({
  id: uuidSchema,
  cardId: uuidSchema,
  date: z.string(),
  description: z.string(),
  categoryId: uuidSchema,
  totalAmount: z.string(),
  currency: cardCurrencySchema,
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
  currency: cardCurrencySchema,
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

/**
 * TAR-05 / COM-03 (iteration 9): a statement in the "Cuotas por resumen" chart. Every statement
 * from the first to the last one with installments (1 payment included), oldest first.
 */
export const installmentStatementSchema = z.object({
  period: periodSchema,
  dueDate: z.string(),
  status: statementStatusSchema,
  /** Sum of the installments in the statement (adjustments not included). */
  installmentsTotal: byCurrencySchema,
  installmentsCount: z.number().int(),
  /** Last installments of plans of 2 or more that end in this statement: what frees next month. */
  releases: byCurrencySchema,
});

export const installmentsQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  /** The installments of the statement of this period (TAR-05, iteration 9). */
  period: periodSchema.optional(),
});

/** TAR-05 (iteration 9): an installment of the chosen statement. */
export const statementPlanInstallmentSchema = z.object({
  chargeId: uuidSchema,
  description: z.string(),
  category: categoryRefSchema,
  currency: cardCurrencySchema,
  /** "Cuota 4 de 12". */
  number: z.number().int(),
  count: z.number().int(),
  amount: z.string(),
  /** Installments covered up to this statement, for the progress bar (equals `number`). */
  paidThrough: z.number().int(),
  /** What the plan still owes after this statement. */
  remainingAfter: z.string(),
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
  currency: cardCurrencySchema,
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
  currency: cardCurrencySchema,
  /** Amount of that part being paid. */
  amount: amountSchema,
  /** What leaves the pocket, when its currency differs from the part (paying dollars with pesos). */
  amountOut: amountSchema.optional(),
  date: localDateSchema,
});

export type CreateCardRequest = z.input<typeof createCardRequestSchema>;
export type UpdateCardRequest = z.infer<typeof updateCardRequestSchema>;
export type StatementSummary = z.infer<typeof statementSummarySchema>;
export type StartStatement = z.infer<typeof startStatementSchema>;
export type Card = z.infer<typeof cardSchema>;
export type StatementDetail = z.infer<typeof statementDetailSchema>;
export type StatementInstallment = z.infer<typeof statementInstallmentSchema>;
export type CreateChargeRequest = z.input<typeof createChargeRequestSchema>;
export type UpdateChargeRequest = z.infer<typeof updateChargeRequestSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type ActiveInstallment = z.infer<typeof activeInstallmentSchema>;
export type InstallmentStatement = z.infer<typeof installmentStatementSchema>;
export type InstallmentsQuery = z.infer<typeof installmentsQuerySchema>;
export type StatementPlanInstallment = z.infer<typeof statementPlanInstallmentSchema>;
export type ChargeStatus = z.infer<typeof chargeStatusSchema>;
export type ChargesQuery = z.infer<typeof chargesQuerySchema>;
export type ChargeListItem = z.infer<typeof chargeListItemSchema>;
export type ChargesPage = z.infer<typeof chargesPageSchema>;
export type StatementsQuery = z.input<typeof statementsQuerySchema>;
export type CloseStatementRequest = z.infer<typeof closeStatementRequestSchema>;
export type PayStatementRequest = z.infer<typeof payStatementRequestSchema>;
