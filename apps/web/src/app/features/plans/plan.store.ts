import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { MyPlan, PlanRequestDto, PublicPlan } from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** The user's plan, its limits and usage (GET /me/plan). */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<MyPlan>(() => `${API}/me/plan`);
  readonly plan = computed(() => this.resource.value());
  /** Until it loads, features stay visible: the API has the last word anyway. */
  readonly hasInvestments = computed(() => this.plan()?.plan.limits.investments ?? true);

  constructor() {
    // Usage changes with every create or archive of a limited resource.
    reloadOn(this.bus, ['plan', 'accounts', 'cards', 'fixed', 'goals'], () =>
      this.resource.reload(),
    );
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
