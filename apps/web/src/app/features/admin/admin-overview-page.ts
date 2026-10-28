import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { AdminMetrics } from '@platin/contracts';
import { formatDate, PlErrorState, PlSkeleton } from '@platin/web-ui';
import { ADMIN_API } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

type FeatureKey = keyof AdminMetrics['featureUsage'];

/** ADM-02: aggregated metrics, never per-user content. */
@Component({
  selector: 'pl-admin-overview-page',
  imports: [PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-5 text-2xl font-bold tracking-[-0.03em]">{{ t.title }}</h1>
    @if (metrics.error()) {
      <pl-error-state [heading]="loadError" (retry)="metrics.reload()" />
    } @else if (data(); as m) {
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        @for (card of cards(); track card.label) {
          <div class="flex flex-col gap-1 rounded-tile bg-surface p-4">
            <span class="text-sm text-muted">{{ card.label }}</span>
            <span class="font-amount text-3xl font-semibold">{{ card.value }}</span>
          </div>
        }
      </div>

      <section class="mt-4 rounded-card bg-surface p-5" aria-labelledby="signups-title">
        <h2 id="signups-title" class="text-lg font-bold">{{ t.signups }}</h2>
        <p class="text-sm text-muted">{{ t.signupsHint }}</p>
        <ol class="mt-4 flex h-40 items-end gap-1.5">
          @for (week of m.signupsByWeek; track week.weekStart) {
            <li
              class="flex h-full flex-1 flex-col items-center justify-end gap-1"
              [attr.aria-label]="t.signupsAria(format(week.weekStart), week.count)"
            >
              <span class="font-amount text-xs" aria-hidden="true">{{ week.count }}</span>
              <span
                class="w-full rounded-t-md"
                [class]="week.count === 0 ? 'bg-line' : 'bg-brand'"
                [style.height.%]="barHeight(week.count)"
                aria-hidden="true"
              ></span>
            </li>
          }
        </ol>
        <div class="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
          <span>{{ format(m.signupsByWeek[0].weekStart) }}</span>
          <span>{{ format(m.signupsByWeek[m.signupsByWeek.length - 1].weekStart) }}</span>
        </div>
      </section>

      <section class="mt-4 rounded-card bg-surface p-5" aria-labelledby="features-title">
        <h2 id="features-title" class="text-lg font-bold">{{ t.features }}</h2>
        <p class="text-sm text-muted">{{ t.featuresHint }}</p>
        <ul class="mt-3 flex flex-col">
          @for (feature of features; track feature) {
            <li
              class="flex min-h-12 items-center justify-between gap-4 border-b border-line-soft last:border-b-0"
            >
              <span>{{ t.featureNames[feature] }}</span>
              <span class="flex items-center gap-3">
                <span class="hidden h-2 w-32 overflow-hidden rounded-full bg-line-soft sm:block">
                  <span
                    class="block h-full rounded-full bg-card"
                    [style.width.%]="share(m.featureUsage[feature], m.totalUsers)"
                  ></span>
                </span>
                <span class="font-amount w-10 text-right font-semibold">{{
                  m.featureUsage[feature]
                }}</span>
              </span>
            </li>
          }
        </ul>
      </section>
    } @else {
      <pl-skeleton [heights]="[96, 220, 260]" />
    }
  `,
})
export class AdminOverviewPage {
  protected readonly t = ADMIN_TEXTS.overview;
  protected readonly loadError = ADMIN_TEXTS.loadError;
  protected readonly metrics = httpResource<AdminMetrics>(() => `${ADMIN_API}/metrics`);
  protected readonly data = computed(() => this.metrics.value());
  protected readonly features: FeatureKey[] = [
    'cards',
    'goals',
    'fixed',
    'investments',
    'savingsPockets',
  ];
  protected readonly format = formatDate;

  protected readonly cards = computed(() => {
    const m = this.data();
    if (!m) return [];
    return [
      { label: this.t.totalUsers, value: m.totalUsers },
      { label: this.t.active7, value: m.activeLast7Days },
      { label: this.t.active30, value: m.activeLast30Days },
      { label: this.t.suspended, value: m.suspendedUsers },
    ];
  });

  private readonly maxSignups = computed(() =>
    Math.max(1, ...(this.data()?.signupsByWeek.map((week) => week.count) ?? [])),
  );

  protected barHeight(count: number): number {
    return count === 0 ? 3 : Math.max(6, (count / this.maxSignups()) * 85);
  }

  protected share(count: number, total: number): number {
    return total === 0 ? 0 : (count / total) * 100;
  }
}
