import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { LatestRates } from '@platin/contracts';
import { API } from './api';
import { AuthService } from './auth/auth.service';

/** Today's rates, to show which one a movement in dollars will use. */
@Injectable({ providedIn: 'root' })
export class RatesStore {
  private readonly auth = inject(AuthService);
  readonly resource = httpResource<LatestRates>(() =>
    this.auth.isAuthenticated() ? `${API}/rates/latest` : undefined,
  );

  /** Sell rate of the user's preferred type, as a decimal string. */
  readonly preferred = computed(() => {
    const type = this.auth.user()?.valuationRate ?? 'MEP';
    return this.resource.value()?.rates.find((rate) => rate.type === type) ?? null;
  });
}
