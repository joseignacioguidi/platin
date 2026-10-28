import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { CreateValuationsRequest, Investments, ValuationsResponse } from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus, reloadOn } from '../../core/data/refresh-bus';

/** A valuation changes balances, movements, savings and the home reminder. */
const AFFECTED: DataKey[] = ['accounts', 'movements', 'dashboard', 'goals'];

/** INV-03..05: investment pockets with their summary, and the valuations. */
@Injectable({ providedIn: 'root' })
export class InvestmentsStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<Investments>(() => `${API}/investments`);
  readonly investments = computed(() => this.resource.value());
  /** Every investment pocket, account after account. */
  readonly pockets = computed(() =>
    (this.investments()?.accounts ?? []).flatMap((account) => account.pockets),
  );

  constructor() {
    reloadOn(this.bus, ['accounts', 'movements'], () => this.resource.reload());
  }

  valuationsOf(pocketId: string): Promise<ValuationsResponse> {
    return firstValueFrom(
      this.http.get<ValuationsResponse>(`${API}/pockets/${pocketId}/valuations`),
    );
  }

  saveValuations(request: CreateValuationsRequest): Promise<ValuationsResponse> {
    return this.write(this.http.post<ValuationsResponse>(`${API}/investments/valuations`, request));
  }

  removeValuation(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${API}/valuations/${id}`));
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED);
    return result;
  }
}
