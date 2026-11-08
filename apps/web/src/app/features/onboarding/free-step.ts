import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronRight } from '@lucide/angular';
import type { Dashboard } from '@platin/contracts';
import { lastDayOf, parsePeriod } from '@platin/domain';
import { formatDate, PlMoney, PlSkeleton } from '@platin/web-ui';
import { API } from '../../core/api';
import { QuickEntryLauncher } from '../quick-entry/quick-entry-launcher';
import { monthName, ONBOARDING_TEXTS } from './onboarding.texts';
import { FOOT_PRIMARY, OnboardingShell } from './onboarding-shell';
import { ONBOARDING_PATHS } from './onboarding-steps';

/** Step 4 (AUTH-05): the free amount of the month with what it comes from (mockup 4). */
@Component({
  selector: 'pl-onboarding-free',
  imports: [OnboardingShell, PlMoney, PlSkeleton, RouterLink, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-onboarding-shell [step]="4" (back)="back()">
      @if (dashboard.value(); as d) {
        <div class="flex flex-col gap-2">
          <p class="text-[15px] text-muted">{{ t.title(month()) }}</p>
          <p class="text-5xl font-bold tracking-[-1.5px]">
            <pl-money [amount]="d.free" [currency]="d.currency" />
          </p>
          @if (d.perDay) {
            <p
              class="self-start rounded-full bg-brand-soft px-3 py-1.5 text-sm font-bold text-brand-strong"
            >
              ≈ <pl-money [amount]="d.perDay" [currency]="d.currency" /> {{ t.perDay }}
              {{ lastDay() }}
            </p>
          }
        </div>
        <section class="flex flex-col rounded-tile bg-surface px-4 py-1.5">
          <div class="flex min-h-12 items-center justify-between gap-3 text-[15px]">
            <span>{{ t.inAccounts }}</span>
            <pl-money [amount]="d.inAccounts" [currency]="d.currency" />
          </div>
          @if (d.toCollect !== '0.00') {
            <div
              class="flex min-h-12 items-center justify-between gap-3 border-t border-line text-[15px]"
            >
              <span>{{ t.toCollect }}</span>
              <pl-money [amount]="d.toCollect" [currency]="d.currency" sign="always" />
            </div>
          }
          <div
            class="flex min-h-12 items-center justify-between gap-3 border-t border-line text-[15px]"
          >
            <span>{{ t.toPay }}</span>
            <span>− <pl-money [amount]="d.toPay" [currency]="d.currency" sign="never" /></span>
          </div>
          <div
            class="flex min-h-12 items-center justify-between gap-3 border-t border-line text-[15px] font-bold"
          >
            <span>{{ t.free }}</span>
            <pl-money [amount]="d.free" [currency]="d.currency" />
          </div>
        </section>
        <p class="text-sm text-muted">{{ t.note }}</p>
      } @else if (dashboard.error()) {
        <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm">{{ t.error }}</p>
      } @else {
        <pl-skeleton class="h-40" />
      }

      <div class="flex flex-col gap-2">
        <p class="text-[13px] font-bold uppercase text-muted">{{ t.next }}</p>
        <button type="button" [class]="link" (click)="firstExpense()">
          <span class="flex-1 text-left text-[15px] font-semibold">{{ t.firstExpense }}</span>
          <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
        </button>
        <a routerLink="/app/ahorros" [class]="link">
          <span class="flex-1 text-[15px] font-semibold">{{ t.goal }}</span>
          <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
        </a>
      </div>

      <ng-container footer>
        <a routerLink="/app" [class]="primary + ' flex items-center justify-center'">{{
          t.home
        }}</a>
      </ng-container>
    </pl-onboarding-shell>
  `,
})
export class FreeStep {
  protected readonly t = ONBOARDING_TEXTS.free;
  protected readonly primary = FOOT_PRIMARY;
  protected readonly link =
    'flex min-h-14 items-center gap-3 rounded-[18px] border-[1.5px] border-line bg-surface px-4 hover:bg-field';

  private readonly router = inject(Router);
  private readonly quickEntry = inject(QuickEntryLauncher);
  protected readonly dashboard = httpResource<Dashboard>(() => `${API}/dashboard`);

  protected readonly month = computed(() => {
    const period = this.dashboard.value()?.period;
    return period ? monthName(period) : '';
  });
  /** "30/11". */
  protected readonly lastDay = computed(() => {
    const period = this.dashboard.value()?.period;
    return period ? formatDate(lastDayOf(parsePeriod(period))).replace(/\/\d{4}$/, '') : '';
  });

  protected back(): void {
    void this.router.navigateByUrl(ONBOARDING_PATHS.fixed);
  }

  protected async firstExpense(): Promise<void> {
    await this.router.navigateByUrl('/app');
    this.quickEntry.open();
  }
}
