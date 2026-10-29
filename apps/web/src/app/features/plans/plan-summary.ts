import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { localDateAt } from '@platin/domain';
import { formatDate, PlBottomSheet, PlButton, PlProgress } from '@platin/web-ui';
import { PlanSheet, PlanSheetData } from './plan-sheet';
import { PlanStore } from './plan.store';
import { LIMIT_KEYS, PLANS_TEXTS } from './plans.texts';

/** PLN-03: "Tu plan" in the profile, with the usage of each limit and its expiry. */
@Component({
  selector: 'pl-plan-summary',
  imports: [PlProgress, PlButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (store.plan(); as mine) {
      <section class="flex flex-col gap-4 rounded-card bg-surface p-5" aria-labelledby="plan-title">
        <div class="flex items-baseline justify-between gap-3">
          <h2 id="plan-title" class="text-lg font-bold">{{ t.yourPlan }}</h2>
          <span class="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold">{{
            mine.plan.name
          }}</span>
        </div>
        @if (mine.endsAt) {
          <p class="-mt-2 text-sm text-muted">{{ t.until(lastDay(mine.endsAt)) }}</p>
        }
        <ul class="flex flex-col gap-3">
          @for (resource of t.resources; track resource) {
            @let limit = mine.plan.limits[keys[resource]];
            @let used = mine.usage[resource];
            <li class="flex flex-col gap-1.5">
              <span class="text-[15px]">{{ t.usage(used, limit, resource) }}</span>
              @if (limit !== null) {
                <pl-progress
                  [value]="limit === 0 ? 100 : (used / limit) * 100"
                  [tone]="used >= limit ? 'pending' : 'brand'"
                  [label]="t.usage(used, limit, resource)"
                />
              }
            </li>
          }
          <li class="text-[15px]">
            {{ mine.plan.limits.investments ? t.investmentsIncluded : t.investmentsNotIncluded }}
          </li>
        </ul>
        @if (mine.pendingRequest; as pending) {
          <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink" role="status">
            {{ t.pending(pending.planName) }}
          </p>
        } @else {
          <button plButton="secondary" type="button" (click)="ask()">{{ t.askAnother }}</button>
        }
        <a
          routerLink="/planes"
          class="flex min-h-11 items-center justify-center text-sm font-semibold text-brand-strong"
          >{{ t.seePlans }}</a
        >
      </section>
    }
  `,
})
export class PlanSummary {
  protected readonly store = inject(PlanStore);
  private readonly sheet = inject(PlBottomSheet);
  protected readonly t = PLANS_TEXTS;
  protected readonly keys = LIMIT_KEYS;

  /** endsAt is the first instant it no longer applies: the last day is the one before. */
  protected lastDay(endsAt: string): string {
    return formatDate(localDateAt(new Date(new Date(endsAt).getTime() - 1)));
  }

  protected ask(): void {
    this.sheet.open<PlanSheet, PlanSheetData>(PlanSheet, {
      data: { reason: { kind: 'request' } },
      ariaLabel: PLANS_TEXTS.requestTitle,
    });
  }
}
