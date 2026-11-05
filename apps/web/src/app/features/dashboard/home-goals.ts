import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Goal } from '@platin/contracts';
import { toDecimal } from '@platin/domain';
import { PlMoney, PlProgress } from '@platin/web-ui';
import { SavingsStore } from '../savings/savings.store';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** DAS-07 (6): each active goal with what is saved, its progress and its pace. */
@Component({
  selector: 'pl-home-goals',
  imports: [RouterLink, PlMoney, PlProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2.5 xl:gap-3.5 xl:rounded-card xl:bg-surface xl:px-5 xl:py-4' },
  template: `
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-extrabold xl:text-base">{{ texts.goals }}</h2>
      <a
        routerLink="/app/ahorros"
        class="flex min-h-11 items-center text-[15px] font-semibold text-brand-strong xl:text-sm"
        >{{ texts.see }}</a
      >
    </div>
    @if (store.activeGoals().length > 0) {
      <ul class="grid grid-cols-2 gap-2 xl:grid-cols-1 xl:gap-4">
        @for (goal of store.activeGoals(); track goal.id) {
          <li>
            <a
              [routerLink]="['/app/metas', goal.id]"
              class="flex h-full flex-col gap-2 rounded-[18px] bg-surface p-3.5 xl:gap-1.5 xl:rounded-xl xl:p-0"
            >
              <span class="flex flex-col gap-2 xl:flex-row xl:items-baseline xl:justify-between">
                <span class="truncate text-[15px] font-bold">{{ goal.name }}</span>
                <pl-money
                  class="text-[15px] xl:text-sm"
                  [amount]="goal.projection.accumulated"
                  [currency]="goal.currency"
                  [decimals]="false"
                />
              </span>
              <pl-progress
                [value]="percent(goal)"
                [label]="texts.goalProgress(goal.name, percent(goal))"
              />
              <span class="text-[13px] text-muted xl:text-xs"
                >{{ percent(goal) }} % · {{ texts.pace[goal.projection.pace] }}</span
              >
            </a>
          </li>
        }
      </ul>
    } @else if (store.goalsResource.hasValue()) {
      <a
        routerLink="/app/ahorros"
        class="flex min-h-11 flex-col gap-1 rounded-tile bg-surface p-4 text-sm xl:p-0"
      >
        <span class="text-muted">{{ texts.noGoals }}</span>
        <span class="font-semibold text-brand-strong">{{ texts.createGoal }}</span>
      </a>
    }
  `,
})
export class HomeGoals {
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly store = inject(SavingsStore);

  /** Whole percent of the goal, 0..100. */
  protected percent(goal: Goal): number {
    return Math.min(100, toDecimal(goal.projection.progress).times(100).floor().toNumber());
  }
}
