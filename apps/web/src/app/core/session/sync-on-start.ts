import { HttpClient } from '@angular/common/http';
import { inject, provideAppInitializer } from '@angular/core';
import type { SyncResponse } from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../api';
import { RefreshBus } from '../data/refresh-bus';
import { SessionService } from './session.service';

/**
 * Every time a session starts (app opened, login, registration) the API generates pending
 * movements of fixed items and missing statements; then everything shown is refreshed.
 */
export function provideSyncOnStart() {
  return provideAppInitializer(() => {
    const session = inject(SessionService);
    const http = inject(HttpClient);
    const bus = inject(RefreshBus);
    session.onStart(async () => {
      await firstValueFrom(http.post<SyncResponse>(`${API}/sync`, null));
      bus.invalidate('movements', 'accounts', 'cards', 'fixed', 'commitments', 'dashboard');
    });
  });
}
