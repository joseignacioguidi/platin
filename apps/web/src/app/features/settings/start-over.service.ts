import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { DataSummary, ResetRequest } from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { DataKey, RefreshBus } from '../../core/data/refresh-bus';

/** What the app remembers in the browser about the user's data (not the theme or the session hint). */
const REMEMBERED_DATA_KEYS = ['platin.lastPocket', 'platin.recentCategories'];

/** Every group of server data: after starting over, all of it is stale. */
const ALL_KEYS: DataKey[] = [
  'accounts',
  'categories',
  'movements',
  'cards',
  'fixed',
  'commitments',
  'dashboard',
  'goals',
];

/** AUTH-09: what starting over would delete, and doing it. */
@Injectable({ providedIn: 'root' })
export class StartOver {
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);

  summary(): Promise<DataSummary> {
    return firstValueFrom(this.http.get<DataSummary>(`${API}/users/me/data-summary`));
  }

  async reset(request: ResetRequest): Promise<void> {
    await firstValueFrom(this.http.post<DataSummary>(`${API}/users/me/reset`, request));
    for (const key of REMEMBERED_DATA_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Private mode: nothing was remembered.
      }
    }
    this.bus.invalidate(...ALL_KEYS);
  }
}
