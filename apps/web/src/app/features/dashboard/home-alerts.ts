import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight } from '@lucide/angular';
import type { Dashboard } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { formatDate } from '@platin/web-ui';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** Whether the home has any alert to show (DAS-07, 2). */
export const hasAlerts = (d: Dashboard) =>
  d.pending.count > 0 || !!d.rate?.stale || d.valuationsOverdue;

/**
 * DAS-07 (2): one line per alert that applies: movements to confirm, a stale rate, investment
 * values to update.
 */
@Component({
  selector: 'pl-home-alerts',
  imports: [RouterLink, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    @let d = dashboard();
    @if (d.pending.count > 0) {
      <a routerLink="/app/compromisos/para-confirmar" [class]="line">
        <span class="flex min-w-0 flex-1 flex-col">
          <span>{{ texts.pendingCount(d.pending.count) }}</span>
          <span class="truncate text-[13px] font-normal">{{
            texts.joinNames(d.pending.names)
          }}</span>
        </span>
        <svg lucideChevronRight class="shrink-0" [size]="18"></svg>
      </a>
    }
    @if (d.rate?.stale) {
      <p [class]="line" role="status">{{ staleText() }}</p>
    }
    @if (d.valuationsOverdue) {
      <a routerLink="/app/inversiones/actualizar" [class]="line">
        <span class="min-w-0 flex-1">{{ texts.valuationsOverdue }}</span>
        <svg lucideChevronRight class="shrink-0" [size]="18"></svg>
      </a>
    }
  `,
})
export class HomeAlerts {
  readonly dashboard = input.required<Dashboard>();
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly line =
    'flex min-h-[52px] items-center gap-2.5 rounded-2xl bg-pending-soft px-4 py-3 text-[15px] font-semibold text-pending-ink';

  protected readonly staleText = computed(() => {
    const rate = this.dashboard().rate;
    if (!rate) return '';
    return this.texts.staleRate(
      this.texts.rateTypes[rate.type],
      formatDate(parseLocalDate(rate.date)),
    );
  });
}
