import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { LatestRates } from '@platin/contracts';
import { canConvert, conversionFactor, Currency, RateTable, round6 } from '@platin/domain';
import { API } from './api';
import { AuthService } from './auth/auth.service';

/** Today's rates, to show which one a movement in another currency will use. */
@Injectable({ providedIn: 'root' })
export class RatesStore {
  private readonly auth = inject(AuthService);
  readonly resource = httpResource<LatestRates>(() =>
    this.auth.isAuthenticated() ? `${API}/rates/latest` : undefined,
  );

  /** Sell rate of the dollar of the user's preferred type. */
  readonly preferred = computed(() => {
    const type = this.auth.user()?.valuationRate ?? 'MEP';
    return (
      this.resource
        .value()
        ?.rates.find((rate) => (rate.currency ?? 'USD') === 'USD' && rate.type === type) ?? null
    );
  });

  /** Pesos per unit of each currency: the dollar of the preferred type, the others oficial. */
  readonly table = computed<RateTable>(() => {
    const table: RateTable = {};
    const preferred = this.preferred();
    if (preferred) table.USD = preferred.sell;
    for (const rate of this.resource.value()?.rates ?? []) {
      if (rate.currency !== 'USD' && rate.type === 'OFICIAL') table[rate.currency] = rate.sell;
    }
    return table;
  });

  /**
   * Today's rate between a currency and the base, in the convention of a typed rate: pesos per
   * unit of the other currency when one side is the peso; otherwise base per unit.
   */
  rateFor(currency: Currency, base: Currency): string | null {
    const table = this.table();
    if (currency === base || !canConvert(currency, base, table)) return null;
    const other = currency === 'ARS' ? base : base === 'ARS' ? currency : null;
    if (other) return String(table[other]);
    return round6(conversionFactor(currency, base, table)).toFixed(6);
  }
}
