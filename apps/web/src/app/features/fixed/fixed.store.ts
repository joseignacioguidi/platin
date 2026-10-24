import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type {
  ChangeFixedAmountRequest,
  CreateFixedRequest,
  FixedItem,
  UpdateFixedRequest,
} from '@platin/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus, reloadOn } from '../../core/data/refresh-bus';

const AFFECTED: DataKey[] = ['fixed', 'commitments', 'dashboard', 'movements'];

@Injectable({ providedIn: 'root' })
export class FixedStore {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  readonly resource = httpResource<FixedItem[]>(() => `${API}/fixed`);
  readonly items = computed(() => this.resource.value() ?? []);

  constructor() {
    reloadOn(this.bus, ['fixed'], () => this.resource.reload());
  }

  create(request: CreateFixedRequest): Promise<FixedItem> {
    return this.write(this.http.post<FixedItem>(`${API}/fixed`, request));
  }

  update(id: string, changes: UpdateFixedRequest): Promise<FixedItem> {
    return this.write(this.http.patch<FixedItem>(`${API}/fixed/${id}`, changes));
  }

  changeAmount(id: string, request: ChangeFixedAmountRequest): Promise<FixedItem> {
    return this.write(this.http.post<FixedItem>(`${API}/fixed/${id}/amounts`, request));
  }

  remove(id: string): Promise<void> {
    return this.write(this.http.delete<void>(`${API}/fixed/${id}`));
  }

  private async write<T>(request: Observable<T>): Promise<T> {
    const result = await firstValueFrom(request);
    this.bus.invalidate(...AFFECTED);
    return result;
  }
}
