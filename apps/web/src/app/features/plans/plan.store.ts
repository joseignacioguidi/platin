import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { MyPlan, PlanRequestDto, PublicPlan } from '@platin/contracts';
import {
  checkLimit,
  hasFeature,
  LIMITED_RESOURCES,
  limitOf,
  type LimitedResource,
  type PlanFeature,
} from '@platin/domain';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** Something the plan can block: a feature or creating one more of a limited resource. */
export type PlanGateKey = PlanFeature | LimitedResource;

/** Why something is blocked, in the shape the plan sheet expects. */
export type PlanBlock =
  | { kind: 'limit'; plan: string; resource: LimitedResource; limit: number; upgrade: string }
  | { kind: 'feature'; plan: string; feature: PlanFeature; upgrade: string };

/** Mark used when no public plan includes it (or the plans haven't loaded yet). */
const FALLBACK_UPGRADE = 'Pro';

function isResource(key: PlanGateKey): key is LimitedResource {
  return (LIMITED_RESOURCES as readonly string[]).includes(key);
}

/** The user's plan, its limits and usage (GET /me/plan). */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<MyPlan>(() => `${API}/me/plan`);
  /** Public plans, in order: to name the plan that includes something ("Pro", PLN-07). */
  private readonly plansResource = httpResource<PublicPlan[]>(() => `${API}/plans`);
  readonly plan = computed(() => this.resource.value());

  constructor() {
    // Usage changes with every create or archive of a limited resource.
    reloadOn(this.bus, ['plan', 'accounts', 'cards', 'fixed', 'goals'], () =>
      this.resource.reload(),
    );
  }

  /** PLN-07: whether the plan includes a feature (true until the plan loads). */
  can(feature: PlanFeature): boolean {
    const plan = this.plan();
    return !plan || hasFeature(plan.plan.limits, feature);
  }

  /** How many more of a resource fit; `null` = unlimited (or the plan hasn't loaded). */
  remaining(resource: LimitedResource): number | null {
    const plan = this.plan();
    if (!plan) return null;
    const limit = limitOf(plan.plan.limits, resource);
    return limit === null ? null : Math.max(0, limit - plan.usage[resource]);
  }

  /** "2 de 2 cuentas": usage against the limit, `null` when unlimited or unknown. */
  usage(resource: LimitedResource): { used: number; limit: number } | null {
    const plan = this.plan();
    if (!plan) return null;
    const limit = limitOf(plan.plan.limits, resource);
    return limit === null ? null : { used: plan.usage[resource], limit };
  }

  /** The first blocked key, with what the plan sheet needs to explain it; `null` = allowed. */
  block(keys: PlanGateKey | readonly PlanGateKey[]): PlanBlock | null {
    const plan = this.plan();
    if (!plan) return null;
    const limits = plan.plan.limits;
    for (const key of typeof keys === 'string' ? [keys] : keys) {
      if (isResource(key)) {
        const check = checkLimit(limits, key, plan.usage[key]);
        if (!check.allowed) {
          return {
            kind: 'limit',
            plan: plan.plan.name,
            resource: key,
            limit: check.limit ?? 0,
            upgrade: this.upgradeFor(key, plan.usage[key]),
          };
        }
      } else if (!hasFeature(limits, key)) {
        return {
          kind: 'feature',
          plan: plan.plan.name,
          feature: key,
          upgrade: this.upgradeFor(key),
        };
      }
    }
    return null;
  }

  /** Name of the first public plan (in order) that would allow it. */
  private upgradeFor(key: PlanGateKey, used = 0): string {
    const current = this.plan()?.plan.id;
    const plans = this.plansResource.value() ?? [];
    const match = plans.find(
      (plan) =>
        plan.id !== current &&
        (isResource(key)
          ? checkLimit(plan.limits, key, used).allowed
          : hasFeature(plan.limits, key)),
    );
    return match?.name ?? FALLBACK_UPGRADE;
  }

  publicPlans(): Promise<PublicPlan[]> {
    return firstValueFrom(this.http.get<PublicPlan[]>(`${API}/plans`));
  }

  async request(planId: string, message?: string): Promise<PlanRequestDto> {
    const created = await firstValueFrom(
      this.http.post<PlanRequestDto>(`${API}/plan-requests`, { planId, message }),
    );
    this.bus.invalidate('plan');
    return created;
  }
}
