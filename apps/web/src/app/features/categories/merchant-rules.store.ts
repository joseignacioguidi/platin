import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  CreateMerchantRuleRequest,
  MerchantRule,
  UpdateMerchantRuleRequest,
} from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** TXT-03: "si el motivo dice coto, la categoría es Supermercado". */
@Injectable({ providedIn: 'root' })
export class MerchantRulesStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<MerchantRule[]>(() => `${API}/merchant-rules`);
  readonly rules = computed(() => this.resource.value() ?? []);

  constructor() {
    // Merging categories moves their rules.
    reloadOn(this.bus, ['text-entry', 'categories'], () => this.resource.reload());
  }

  ofCategory(categoryId: string): MerchantRule[] {
    return this.rules().filter((rule) => rule.categoryId === categoryId);
  }

  async create(request: CreateMerchantRuleRequest): Promise<MerchantRule> {
    const rule = await firstValueFrom(this.http.post<MerchantRule>(`${API}/merchant-rules`, request));
    this.bus.invalidate('text-entry');
    return rule;
  }

  async update(id: string, changes: UpdateMerchantRuleRequest): Promise<MerchantRule> {
    const rule = await firstValueFrom(
      this.http.patch<MerchantRule>(`${API}/merchant-rules/${id}`, changes),
    );
    this.bus.invalidate('text-entry');
    return rule;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${API}/merchant-rules/${id}`));
    this.bus.invalidate('text-entry');
  }
}
