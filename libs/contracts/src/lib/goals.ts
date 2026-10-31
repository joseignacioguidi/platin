import { GoalStatus } from '@platin/domain';
import { z } from 'zod';
import { pocketKindSchema } from './accounts';
import { amountSchema, currencySchema, periodSchema, uuidSchema } from './common';

export const goalStatusSchema = z.enum([
  GoalStatus.ACTIVE,
  GoalStatus.ACHIEVED,
  GoalStatus.CANCELLED,
]);
export const goalPaceSchema = z.enum(['AHEAD', 'BEHIND', 'ON_TRACK']);

/** MET-01: target amount, currency and month, and the pockets that measure it (MET-02). */
export const createGoalRequestSchema = z.object({
  name: z.string().trim().min(1, 'Ingresá un nombre').max(60),
  targetAmount: amountSchema,
  currency: currencySchema,
  targetPeriod: periodSchema,
  pocketIds: z.array(uuidSchema).max(20).default([]),
});

export const updateGoalRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    targetAmount: amountSchema,
    targetPeriod: periodSchema,
    /** MET-05: mark as achieved or cancelled (or back to active). */
    status: goalStatusSchema,
    pocketIds: z.array(uuidSchema).max(20),
  })
  .partial();

const simulationSchema = z.object({
  monthly: z.string(),
  monthsNeeded: z.number().int(),
  reachedIn: z.string(),
  /** Positive: months before the target; negative: after. */
  monthsBeforeTarget: z.number().int(),
});

export const goalProjectionSchema = z.object({
  accumulated: z.string(),
  remaining: z.string(),
  /** Ratio 0..1 with 4 decimals. */
  progress: z.string(),
  monthsLeft: z.number().int(),
  monthlyNeeded: z.string(),
  expectedToDate: z.string(),
  pace: goalPaceSchema,
  paceDifference: z.string(),
  simulation: simulationSchema.optional(),
});

export const goalSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  targetAmount: z.string(),
  currency: currencySchema,
  targetPeriod: z.string(),
  startPeriod: z.string(),
  status: goalStatusSchema,
  /** Linked pockets with their balance converted to the goal currency. */
  pockets: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      accountName: z.string(),
      currency: currencySchema,
      balance: z.string(),
      balanceInGoalCurrency: z.string(),
    }),
  ),
  projection: goalProjectionSchema,
});

export const goalProjectionQuerySchema = z.object({ monthly: amountSchema });

/**
 * GET /savings: total saved valued in USD (dollar of the preferred type, the other currencies at
 * the oficial rate), and what each currency adds (MON-03).
 */
export const savingsSchema = z.object({
  rate: z.object({ type: z.string(), sell: z.string() }).nullable(),
  totalUsd: z.string(),
  totalArs: z.string(),
  /** One line per currency with savings, with its value in USD; biggest first by value. */
  byCurrency: z.array(
    z.object({ currency: currencySchema, amount: z.string(), valueUsd: z.string() }),
  ),
  /** Savings and investment pockets that count for net worth. */
  pockets: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      accountName: z.string(),
      kind: pocketKindSchema,
      currency: currencySchema,
      balance: z.string(),
    }),
  ),
});

export type CreateGoalRequest = z.input<typeof createGoalRequestSchema>;
export type UpdateGoalRequest = z.infer<typeof updateGoalRequestSchema>;
export type GoalProjection = z.infer<typeof goalProjectionSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Savings = z.infer<typeof savingsSchema>;
