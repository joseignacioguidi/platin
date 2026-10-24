import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  CreateContributionRequest,
  CreateGoalRequest,
  Goal,
  Savings,
  UpdateGoalRequest,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';

@Injectable({ providedIn: 'root' })
export class SavingsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly goalsResource = httpResource<Goal[]>(() => `${API}/goals`);
  readonly savingsResource = httpResource<Savings>(() => `${API}/savings`);
  readonly goals = computed(() => this.goalsResource.value() ?? []);
  readonly activeGoals = computed(() => this.goals().filter((g) => g.status === 'ACTIVE'));

  constructor() {
    reloadOn(this.bus, ['goals', 'accounts'], () => {
      this.goalsResource.reload();
      this.savingsResource.reload();
    });
  }

  create(request: CreateGoalRequest): Promise<Goal> {
    return this.write(this.http.post<Goal>(`${API}/goals`, request));
  }

  update(id: string, changes: UpdateGoalRequest): Promise<Goal> {
    return this.write(this.http.patch<Goal>(`${API}/goals/${id}`, changes));
  }

  contribute(id: string, request: CreateContributionRequest): Promise<Goal> {
    return this.write(this.http.post<Goal>(`${API}/goals/${id}/contributions`, request));
  }

  remove(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${API}/goals/${id}`));
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate('goals');
    return result;
  }
}
