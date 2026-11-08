import { ONBOARDING_STEP_STATUSES, ONBOARDING_STEPS } from '@platin/domain';
import { z } from 'zod';

export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export const onboardingStepStatusSchema = z.enum(ONBOARDING_STEP_STATUSES);

/** Stored in User.preferences.onboarding (ADR 0035). */
export const onboardingStateSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'DONE']),
  steps: z.object({
    accounts: onboardingStepStatusSchema,
    cards: onboardingStepStatusSchema,
    cardCharges: onboardingStepStatusSchema,
    fixed: onboardingStepStatusSchema,
  }),
  dismissedAt: z.string().nullable().default(null),
});

const limitSchema = z.object({
  /** `null` = unlimited. */
  max: z.number().int().nullable(),
  used: z.number().int(),
});

/** GET /onboarding: the state and what each step needs (AUTH-05). */
export const onboardingSchema = onboardingStateSchema.extend({
  /** Steps done or skipped ("N de 4"). */
  progress: z.number().int(),
  /** Steps still pending or "más tarde", in order. */
  missing: z.array(onboardingStepSchema),
  /** Plan limits for what the steps create (rule "Onboarding"). */
  limits: z.object({ accounts: limitSchema, cards: limitSchema, fixed: limitSchema }),
});

export const updateOnboardingStepRequestSchema = z.object({
  status: z.enum(['DONE', 'SKIPPED', 'LATER']),
});

export type OnboardingState = z.infer<typeof onboardingStateSchema>;
export type Onboarding = z.infer<typeof onboardingSchema>;
export type OnboardingStepName = z.infer<typeof onboardingStepSchema>;
export type UpdateOnboardingStepRequest = z.infer<typeof updateOnboardingStepRequestSchema>;
