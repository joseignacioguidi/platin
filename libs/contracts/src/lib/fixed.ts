import { FixedKind } from '@platin/domain';
import { z } from 'zod';
import { colorTokenSchema } from './accounts';
import { iconNameSchema } from './categories';
import { amountSchema, currencySchema, periodSchema, uuidSchema } from './common';

export const fixedKindSchema = z.enum([FixedKind.INCOME, FixedKind.EXPENSE]);

/** FIJ-01: an income or expense that repeats every N months on a pocket. */
export const createFixedRequestSchema = z
  .object({
    kind: fixedKindSchema,
    name: z.string().trim().min(1, 'Ingresá un nombre').max(60),
    categoryId: uuidSchema,
    pocketId: uuidSchema,
    amount: amountSchema,
    intervalMonths: z.number().int().min(1).max(24).default(1),
    dayOfMonth: z.number().int().min(1, 'Entre 1 y 31').max(31, 'Entre 1 y 31'),
    startPeriod: periodSchema,
    endPeriod: periodSchema.nullable().default(null),
  })
  .refine((f) => !f.endPeriod || f.endPeriod >= f.startPeriod, {
    message: 'El fin no puede ser anterior al inicio',
    path: ['endPeriod'],
  });

export const updateFixedRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    categoryId: uuidSchema,
    pocketId: uuidSchema,
    dayOfMonth: z.number().int().min(1).max(31),
    /** FIJ-03 "finalizar": last period included; null removes the end. */
    endPeriod: periodSchema.nullable(),
    /** FIJ-03 "pausar": nothing is generated while paused. */
    paused: z.boolean(),
  })
  .partial();

/** FIJ-02: a new amount from a period on; previous periods keep theirs. */
export const changeFixedAmountRequestSchema = z.object({
  amount: amountSchema,
  effectiveFrom: periodSchema,
});

export const fixedItemSchema = z.object({
  id: uuidSchema,
  kind: fixedKindSchema,
  name: z.string(),
  category: z.object({
    id: uuidSchema,
    name: z.string(),
    icon: iconNameSchema,
    color: colorTokenSchema,
  }),
  pocket: z.object({ id: uuidSchema, name: z.string(), accountName: z.string() }).nullable(),
  currency: currencySchema,
  intervalMonths: z.number().int(),
  dayOfMonth: z.number().int(),
  startPeriod: z.string(),
  endPeriod: z.string().nullable(),
  paused: z.boolean(),
  /** Amount in force this month. */
  currentAmount: z.string(),
  amounts: z.array(z.object({ amount: z.string(), effectiveFrom: z.string() })),
  /** Next occurrence from the current month on, if any. */
  next: z.object({ period: z.string(), date: z.string(), amount: z.string() }).nullable(),
});

export type CreateFixedRequest = z.input<typeof createFixedRequestSchema>;
export type UpdateFixedRequest = z.infer<typeof updateFixedRequestSchema>;
export type ChangeFixedAmountRequest = z.infer<typeof changeFixedAmountRequestSchema>;
export type FixedItem = z.infer<typeof fixedItemSchema>;
