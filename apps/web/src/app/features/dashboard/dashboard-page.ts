import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideEye, LucideEyeOff } from '@lucide/angular';
import type { Dashboard } from '@platin/contracts';
import { compareDates, Period } from '@platin/domain';
import {
  HideAmounts,
  PlButton,
  PlEmptyState,
  PlErrorState,
  PlMonthPicker,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { DASHBOARD_TEXTS } from './dashboard.texts';
import { HomeAccounts } from './home-accounts';
import { HomeAlerts, hasAlerts } from './home-alerts';
import { HomeFreeCard } from './home-free-card';
import { HomeGoals } from './home-goals';

import { HomeRecentMovements } from './home-recent-movements';
import { HomeShortcuts } from './home-shortcuts';
import { OnboardingResumeCard } from '../onboarding/onboarding-resume-card';

/** DAS-07: the practical home (docs/mockups/inicio-v2), on a phone and on a desktop. */
@Component({
  selector: 'pl-dashboard-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlButton,
    PlEmptyState,
    PlMonthPicker,
    LucideEye,
    LucideEyeOff,
    HomeFreeCard,
    HomeAlerts,
    HomeRecentMovements,
    HomeShortcuts,
    HomeAccounts,
    HomeGoals,
    OnboardingResumeCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[13px] text-muted">{{ greeting() }}</span>
        <pl-month-picker class="-ml-3 max-w-72" [(value)]="period" [max]="today.period()" />
      </div>
      <button
        type="button"
        class="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface"
        [attr.aria-label]="hideAmounts.hidden() ? texts.showAmounts : texts.hideAmounts"
        [attr.aria-pressed]="hideAmounts.hidden()"
        (click)="hideAmounts.toggle()"
      >
        @if (hideAmounts.hidden()) {
          <svg lucideEyeOff [size]="20"></svg>
        } @else {
          <svg lucideEye [size]="20"></svg>
        }
      </button>
    </header>

    <!-- AUTH-11: on top while the onboarding is unfinished. -->
    <pl-onboarding-resume-card class="empty:hidden" />

    @if (accounts.resource.hasValue() && accounts.accounts().length === 0) {
      <pl-empty-state icon="wallet" [heading]="texts.emptyTitle" [description]="texts.emptyBody">
        <a plButton routerLink="/app/cuentas" [queryParams]="{ nueva: 1 }">{{
          texts.createAccount
        }}</a>
      </pl-empty-state>
    } @else if (resource.error() && !resource.hasValue()) {
      <pl-error-state (retry)="resource.reload()" />
    } @else if (!resource.hasValue()) {
      <pl-skeleton [heights]="[260, 76, 240]" />
    } @else if (data(); as d) {
      <!--
        DAS-07: one column on a phone, in this order. From xl, two rows: the free card (two
        thirds) with the alerts and shortcuts beside it; then movements, accounts and goals.
      -->
      <div class="flex flex-col gap-5 xl:grid xl:grid-cols-3 xl:items-start">
        <pl-home-free-card
          class="xl:col-span-2 xl:row-start-1 xl:self-stretch"
          [class.xl:row-span-2]="alerts()"
          [dashboard]="d"
          [past]="past()"
        />
        @if (alerts()) {
          <pl-home-alerts class="xl:col-start-3 xl:row-start-1" [dashboard]="d" />
        }
        <pl-home-recent-movements class="xl:col-start-1 xl:row-start-3" />
        <pl-home-shortcuts
          class="xl:col-start-3 xl:self-stretch"
          [class.xl:row-start-1]="!alerts()"
          [class.xl:row-start-2]="alerts()"
        />
        @if (!past()) {
          <pl-home-accounts class="xl:col-start-2 xl:row-start-3" [dashboard]="d" />
        }
        <pl-home-goals class="xl:col-start-3 xl:row-start-3" />
      </div>
    }
  `,
})
export class DashboardPage {
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly today = inject(Today);
  protected readonly hideAmounts = inject(HideAmounts);
  protected readonly accounts = inject(AccountsStore);
  private readonly auth = inject(AuthService);
  private readonly bus = inject(RefreshBus);

  protected readonly period = signal<Period>(this.today.period());
  protected readonly resource = httpResource<Dashboard>(() => ({
    url: `${API}/dashboard`,
    params: { period: this.period() },
  }));
  protected readonly data = computed(() => this.resource.value());

  protected readonly greeting = computed(() => {
    const name = this.auth.user()?.name;
    return name ? `${this.texts.hello}, ${name}` : this.texts.hello;
  });

  /** A previous month has no "to collect", "to pay" nor accounts with payments. */
  protected readonly past = computed(() => {
    const d = this.data();
    return !!d && compareDates(d.period as Period, this.today.period()) < 0;
  });

  protected readonly alerts = computed(() => {
    const d = this.data();
    return !!d && hasAlerts(d);
  });

  constructor() {
    reloadOn(this.bus, ['dashboard', 'movements'], () => this.resource.reload());
  }
}
