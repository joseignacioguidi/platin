import { LIMITED_RESOURCES, PLAN_FEATURES } from '@platin/domain';
import { z } from 'zod';
import { localDateSchema, nonNegativeAmountSchema, uuidSchema } from './common';

export const limitedResourceSchema = z.enum(LIMITED_RESOURCES);
export const planFeatureSchema = z.enum(PLAN_FEATURES);

const limitSchema = z.number().int().min(0).max(100_000).nullable();

/** `null` = unlimited (PLN-01). */
export const planLimitsSchema = z.object({
  maxAccounts: limitSchema,
  maxPockets: limitSchema,
  maxCards: limitSchema,
  maxGoals: limitSchema,
  maxFixed: limitSchema,
  investments: z.boolean(),
});

/** What the public plans page and the user see. */
export const publicPlanSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: z.string(),
  description: z.string(),
  /** Reference price per month in pesos; nothing is charged yet. */
  priceArs: z.string().nullable(),
  limits: planLimitsSchema,
  isDefault: z.boolean(),
});

/** The admin also sees visibility, order, archive and how many users have it. */
export const adminPlanSchema = publicPlanSchema.extend({
  isPublic: z.boolean(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
  userCount: z.number().int(),
});

export const createPlanRequestSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,30}$/, 'Usá minúsculas, números y guiones'),
  name: z.string().trim().min(1, 'Ingresá un nombre').max(40),
  description: z.string().trim().max(200).default(''),
  priceArs: nonNegativeAmountSchema.nullable().default(null),
  limits: planLimitsSchema,
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const updatePlanRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingresá un nombre').max(40),
    description: z.string().trim().max(200),
    priceArs: nonNegativeAmountSchema.nullable(),
    limits: planLimitsSchema,
    isPublic: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
    archived: z.boolean(),
    /** Only `true`: the default plan changes by choosing another one. */
    isDefault: z.literal(true),
  })
  .partial();

export const planUsageSchema = z.object({
  accounts: z.number().int(),
  pockets: z.number().int(),
  cards: z.number().int(),
  goals: z.number().int(),
  fixed: z.number().int(),
});

export const planRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const planRequestSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  planName: z.string(),
  message: z.string().nullable(),
  status: planRequestStatusSchema,
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});

/** GET /me/plan: the plan in force, its limits, the current usage and its expiry (PLN-03). */
export const myPlanSchema = z.object({
  plan: publicPlanSchema,
  source: z.enum(['DEFAULT', 'ADMIN', 'REQUEST', 'PAYMENT']),
  endsAt: z.string().nullable(),
  usage: planUsageSchema,
  pendingRequest: planRequestSchema.nullable(),
});

export const createPlanChangeRequestSchema = z.object({
  planId: uuidSchema,
  message: z.string().trim().max(500).optional(),
});

/** PLN-06: the admin sets a user's plan, with an optional last day. */
export const assignPlanRequestSchema = z.object({
  planId: uuidSchema,
  /** Last day the plan applies (inclusive, Buenos Aires); `null` = no expiry. */
  lastDay: localDateSchema.nullable().default(null),
});

export const adminPlanRequestSchema = planRequestSchema.extend({
  userId: uuidSchema,
  userEmail: z.string().nullable(),
  currentPlanName: z.string().nullable(),
});

export const adminPlanRequestsQuerySchema = z.object({
  status: planRequestStatusSchema.optional(),
});

export type PlanLimitsDto = z.infer<typeof planLimitsSchema>;
export type PublicPlan = z.infer<typeof publicPlanSchema>;
export type AdminPlan = z.infer<typeof adminPlanSchema>;
export type CreatePlanRequest = z.input<typeof createPlanRequestSchema>;
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;
export type PlanUsage = z.infer<typeof planUsageSchema>;
export type PlanRequestDto = z.infer<typeof planRequestSchema>;
export type MyPlan = z.infer<typeof myPlanSchema>;
export type CreatePlanChangeRequest = z.infer<typeof createPlanChangeRequestSchema>;
export type AssignPlanRequest = z.input<typeof assignPlanRequestSchema>;
export type AdminPlanRequest = z.infer<typeof adminPlanRequestSchema>;
