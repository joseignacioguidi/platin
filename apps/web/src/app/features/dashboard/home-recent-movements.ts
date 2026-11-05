import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Movement, MovementsPage } from '@platin/contracts';
import { PlBottomSheet, PlSkeleton } from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { Today } from '../../core/today';
import { MovementRow } from '../transactions/movement-row';
import { MovementSheet } from '../transactions/movement-sheet';
import { TRANSACTIONS_TEXTS } from '../transactions/transactions.texts';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** On a phone the home shows the first 5; on a desktop, 8 (DAS-07). */
const PHONE = 5;
const DESKTOP = 8;

/** DAS-07 (3): the last movements; tapping one opens its edit sheet. */
@Component({
  selector: 'pl-home-recent-movements',
  imports: [RouterLink, MovementRow, PlSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2.5 xl:rounded-card xl:bg-surface xl:px-5 xl:py-4' },
  template: `
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-extrabold xl:text-base">{{ texts.recent }}</h2>
      <a
        routerLink="/app/movimientos"
        class="flex min-h-11 items-center text-[15px] font-semibold text-brand-strong xl:text-sm"
        >{{ texts.seeAllMovements }}</a
      >
    </div>
    @if (resource.hasValue()) {
      @if (items().length > 0) {
        <ul class="rounded-tile bg-surface px-4 xl:rounded-none xl:px-0">
          @for (movement of items(); track movement.kind + movement.id; let i = $index) {
            <li
              class="border-b border-line-soft last:border-b-0 xl:border-t xl:border-b-0"
              [class.hidden]="i >= phone"
              [class.xl:block]="i >= phone"
            >
              <button
                type="button"
                class="block w-full rounded-xl text-left focus-visible:outline-offset-[-2px]"
                (click)="open(movement)"
              >
                <pl-movement-row [movement]="movement" [icons]="false" [dated]="true" />
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="rounded-tile bg-surface px-4 py-4 text-sm text-muted xl:px-0">
          {{ texts.noRecent }}
        </p>
      }
    } @else if (!resource.error()) {
      <pl-skeleton [heights]="[280]" />
    }
  `,
})
export class HomeRecentMovements {
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly phone = PHONE;
  private readonly today = inject(Today);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);

  protected readonly resource = httpResource<MovementsPage>(() => ({
    url: `${API}/movements`,
    // Scheduled movements whose date hasn't come are not "last" ones.
    params: { limit: DESKTOP, until: this.today.date() },
  }));
  protected readonly items = computed(() => this.resource.value()?.items ?? []);

  constructor() {
    reloadOn(this.bus, ['movements'], () => this.resource.reload());
  }

  protected open(movement: Movement): void {
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: TRANSACTIONS_TEXTS.title });
  }
}
