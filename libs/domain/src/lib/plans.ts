/** Resources a plan can limit (PLN-01). */
export const LIMITED_RESOURCES = ['accounts', 'pockets', 'cards', 'goals', 'fixed'] as const;
export type LimitedResource = (typeof LIMITED_RESOURCES)[number];

/** Features a plan can enable. */
export const PLAN_FEATURES = ['investments'] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

/** Limits of a plan: `null` means unlimited. */
export interface PlanLimits {
  maxAccounts: number | null;
  maxPockets: number | null;
  maxCards: number | null;
  maxGoals: number | null;
  maxFixed: number | null;
  investments: boolean;
}

const LIMIT_KEY: Record<LimitedResource, keyof Omit<PlanLimits, PlanFeature>> = {
  accounts: 'maxAccounts',
  pockets: 'maxPockets',
  cards: 'maxCards',
  goals: 'maxGoals',
  fixed: 'maxFixed',
};

export function limitOf(limits: PlanLimits, resource: LimitedResource): number | null {
  return limits[LIMIT_KEY[resource]];
}

export interface LimitCheck {
  allowed: boolean;
  resource: LimitedResource;
  limit: number | null;
  used: number;
}

/**
 * Whether one more record of a resource can be created. Limits are only checked on creation:
 * at the limit or above it (after a downgrade) nothing new is created, but what exists stays.
 * `used` must not count archived records.
 */
export function checkLimit(
  limits: PlanLimits,
  resource: LimitedResource,
  used: number,
): LimitCheck {
  const limit = limitOf(limits, resource);
  return { allowed: limit === null || used < limit, resource, limit, used };
}

export function hasFeature(limits: PlanLimits, feature: PlanFeature): boolean {
  return limits[feature];
}

export interface UserPlanPeriod {
  planId: string;
  startsAt: Date;
  /** First instant it no longer applies; `null` = no expiry. */
  endsAt: Date | null;
}

/**
 * The plan in force: the last one assigned (latest start) that already started and hasn't
 * expired; without any, the default plan. An expired plan never deletes data (PLN-05/06).
 */
export function resolveCurrentPlan<T extends UserPlanPeriod>(
  userPlans: readonly T[],
  defaultPlanId: string,
  now: Date,
): { planId: string; current: T | null } {
  let current: T | null = null;
  for (const userPlan of userPlans) {
    const started = userPlan.startsAt.getTime() <= now.getTime();
    const expired = userPlan.endsAt !== null && userPlan.endsAt.getTime() <= now.getTime();
    if (started && !expired && (!current || userPlan.startsAt > current.startsAt)) {
      current = userPlan;
    }
  }
  return { planId: current?.planId ?? defaultPlanId, current };
}
