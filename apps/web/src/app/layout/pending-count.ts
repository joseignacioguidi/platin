import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { MovementsPage } from '@platin/contracts';
import { API } from '../core/api';
import { RefreshBus, reloadOn } from '../core/data/refresh-bus';
import { Today } from '../core/today';

/** The most the counter asks for; from there on it reads "99+". */
export const PENDING_COUNT_LIMIT = 100;

/** The counter's pill: `pending` with dark text in both themes (sidebar, "Más" and the tab). */
export const PENDING_BADGE_CLASS =
  'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-pending px-1.5 text-xs font-bold text-ink dark:text-on-ink';

/** "99+" from 100, nothing when there are none. */
export function pendingCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return count >= PENDING_COUNT_LIMIT ? '99+' : String(count);
}

/**
 * NAV-01/02, COM-05: how many movements wait in "Para confirmar". Same query as that tab
 * (pending up to today); it reloads whenever movements change.
 */
@Injectable({ providedIn: 'root' })
export class PendingCount {
  private readonly bus = inject(RefreshBus);
  private readonly today = inject(Today);

  private readonly resource = httpResource<MovementsPage>(() => ({
    url: `${API}/movements`,
    params: { status: 'PENDING', until: this.today.date(), limit: PENDING_COUNT_LIMIT },
  }));

  /** Only transactions wait for confirmation, like the tab shows them. */
  readonly count = computed(() => {
    if (!this.resource.hasValue()) return 0;
    const page = this.resource.value();
    const items = page.items.filter((m) => m.kind === 'TRANSACTION').length;
    return page.nextCursor ? Math.max(items, PENDING_COUNT_LIMIT) : items;
  });
  readonly label = computed(() => pendingCountLabel(this.count()));

  constructor() {
    reloadOn(this.bus, ['movements'], () => this.resource.reload());
  }
}
