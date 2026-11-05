import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight } from '@lucide/angular';
import type { Dashboard } from '@platin/contracts';
import { parsePeriod } from '@platin/domain';
import { formatPeriod, PlMoney } from '@platin/web-ui';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** DAS-07 (7): what came in, was spent and was set apart for savings in the month. */
@Component({
  selector: 'pl-home-month',
  imports: [RouterLink, PlMoney, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = dashboard();
    <a
      routerLink="/app/movimientos"
      class="flex flex-col gap-2.5 rounded-tile bg-surface p-4 xl:rounded-card xl:px-5"
    >
      <span class="flex items-center justify-between">
        <span class="text-base font-bold xl:font-extrabold">{{ heading() }}</span>
        <svg lucideChevronRight class="text-muted" [size]="18"></svg>
      </span>
      <span class="flex justify-between gap-3 text-sm">
        <span class="text-muted">{{ texts.received }}</span>
        <pl-money [amount]="d.received" [currency]="d.currency" [decimals]="false" />
      </span>
      <span class="flex justify-between gap-3 text-sm">
        <span class="text-muted">{{ texts.spentShort }}</span>
        <pl-money [amount]="d.spent" [currency]="d.currency" [decimals]="false" />
      </span>
      <span class="flex justify-between gap-3 text-sm">
        <span class="text-muted"
          ><span class="xl:hidden">{{ texts.savedLong }}</span
          ><span class="hidden xl:inline">{{ texts.savedShort }}</span></span
        >
        <pl-money [amount]="d.saved" [currency]="d.currency" [decimals]="false" />
      </span>
    </a>
  `,
})
export class HomeMonth {
  readonly dashboard = input.required<Dashboard>();
  readonly past = input(false);
  protected readonly texts = DASHBOARD_TEXTS;

  /** "Noviembre hasta hoy", or "Así fue octubre" for a previous month. */
  protected readonly heading = computed(() => {
    const month = formatPeriod(parsePeriod(this.dashboard().period)).split(' ')[0];
    return this.past() ? this.texts.monthWhole(month.toLowerCase()) : this.texts.monthSoFar(month);
  });
}
