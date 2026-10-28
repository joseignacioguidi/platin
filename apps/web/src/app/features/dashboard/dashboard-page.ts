import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideEye, LucideEyeOff } from '@lucide/angular';
import type { Dashboard, UpcomingItem } from '@platin/contracts';
import { parseLocalDate, Period } from '@platin/domain';
import {
  dateBadge,
  formatDate,
  HideAmounts,
  PlButton,
  PlEmptyState,
  PlMoney,
  PlMonthPicker,
  PlStackedBar,
  PlStackSegment,
  PlErrorState,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** DAS-01: "Libre este mes", pending items and the next 30 days (mockup "Inicio"). */
@Component({
  selector: 'pl-dashboard-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlMoney,
    PlButton,
    PlEmptyState,
    PlMonthPicker,
    PlStackedBar,
    LucideEye,
    LucideEyeOff,
    LucideChevronRight,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
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
      <section
        class="flex flex-col gap-4 rounded-card bg-surface p-5"
        [attr.aria-label]="texts.free"
      >
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium text-muted">{{ texts.free }}</span>
          <pl-money
            class="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]"
            [amount]="d.free"
            [currency]="d.currency"
            [decimals]="false"
          />
          <span class="text-[13px] text-muted">
            de <pl-money [amount]="d.expectedIncome" [currency]="d.currency" /> {{ texts.ofIncome }}
          </span>
        </div>
        <pl-stacked-bar [segments]="segments()" />
        <dl class="flex flex-col gap-2.5 text-sm">
          @for (row of legend(); track row.label) {
            <div class="flex items-center gap-2.5">
              <span class="size-2.5 rounded-full" [class]="row.dot" aria-hidden="true"></span>
              <dt class="flex-1">
                {{ row.label }}
                @if (row.hint) {
                  <span class="text-muted">{{ row.hint }}</span>
                }
              </dt>
              <dd>
                <pl-money
                  class="text-[13px]"
                  [class.font-semibold]="row.strong"
                  [amount]="row.amount"
                  [currency]="d.currency"
                />
              </dd>
            </div>
          }
        </dl>
      </section>

      @if (d.rate?.stale) {
        <p class="rounded-2xl bg-pending-soft px-4 py-2 text-xs text-pending-ink" role="status">
          {{ staleText() }}
        </p>
      }

      @if (d.valuationsOverdue) {
        <a
          routerLink="/app/inversiones/actualizar"
          class="flex min-h-11 items-center gap-3 rounded-[18px] border border-dashed border-line px-4 py-3 text-[15px]"
        >
          <span class="min-w-0 flex-1">{{ texts.valuationsOverdue }}</span>
          <span class="shrink-0 font-semibold text-brand-strong">{{ texts.updateValues }}</span>
        </a>
      }

      @if (d.pending.count > 0) {
        <a
          routerLink="/app/pendientes"
          class="flex items-center gap-3 rounded-[18px] bg-pending-soft px-4 py-3.5 text-ink"
        >
          <span
            class="font-amount flex size-9 shrink-0 items-center justify-center rounded-full bg-pending font-semibold"
          >
            {{ d.pending.count }}
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-[15px] font-semibold">{{ texts.pendingTitle }}</span>
            <span class="truncate text-[13px] text-pending-ink">{{
              texts.joinNames(d.pending.names)
            }}</span>
          </span>
          <svg lucideChevronRight [size]="20"></svg>
        </a>
      }

      <section class="flex flex-col gap-2.5">
        <div class="flex items-baseline justify-between">
          <h2 class="text-[17px] font-bold">{{ texts.upcoming }}</h2>
          <a routerLink="/app/compromisos" class="text-sm font-medium text-brand-strong">{{
            texts.seeAll
          }}</a>
        </div>
        <ul class="rounded-tile bg-surface px-4">
          @for (item of d.upcoming; track $index) {
            <li
              class="flex min-h-[60px] items-center gap-3 border-b border-line-soft py-2 last:border-b-0"
            >
              <span class="font-amount flex w-11 shrink-0 flex-col items-center leading-tight">
                <span class="text-[17px] font-semibold">{{ badge(item.date).day }}</span>
                <span class="text-[11px] text-muted">{{ badge(item.date).month }}</span>
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="truncate text-[15px] font-semibold">
                  {{ item.type === 'STATEMENT' ? item.cardName : item.name }}
                </span>
                <span class="flex items-center gap-1.5 text-xs text-muted">
                  <span
                    class="size-2 rounded-full"
                    [class.bg-card]="item.type === 'STATEMENT'"
                    [class.bg-expense]="item.type === 'FIXED' && item.kind === 'EXPENSE'"
                    [class.bg-brand]="item.type === 'FIXED' && item.kind === 'INCOME'"
                    aria-hidden="true"
                  ></span>
                  {{ subtitle(item) }}
                </span>
              </span>
              <span class="font-amount flex flex-col items-end gap-0.5 text-[13px]">
                @if (item.type === 'STATEMENT') {
                  <pl-money [amount]="item.ARS" />
                  @if (item.USD !== '0.00') {
                    <span class="text-[11px] text-muted"
                      >+ <pl-money [amount]="item.USD" currency="USD"
                    /></span>
                  }
                } @else {
                  <pl-money
                    [amount]="item.amount"
                    [currency]="item.currency"
                    [tone]="item.kind === 'INCOME' ? 'income' : 'none'"
                  />
                }
              </span>
            </li>
          } @empty {
            <li class="py-4 text-center text-sm text-muted">{{ texts.noUpcoming }}</li>
          }
        </ul>
      </section>
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

  protected readonly segments = computed<PlStackSegment[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: this.texts.spent, amount: d.spent, tone: 'expense' },
      { label: this.texts.committed, amount: d.committed, tone: 'card' },
      { label: this.texts.freeShort, amount: d.free, tone: 'brand' },
    ];
  });

  protected readonly legend = computed(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: this.texts.spent, hint: '', amount: d.spent, dot: 'bg-expense', strong: false },
      {
        label: this.texts.committed,
        hint: this.texts.committedHint,
        amount: d.committed,
        dot: 'bg-card',
        strong: false,
      },
      { label: this.texts.freeShort, hint: '', amount: d.free, dot: 'bg-brand', strong: true },
    ];
  });

  protected readonly staleText = computed(() => {
    const rate = this.data()?.rate;
    if (!rate) return '';
    return this.texts.staleRate(
      this.texts.rateTypes[rate.type],
      formatDate(parseLocalDate(rate.date)),
    );
  });

  constructor() {
    reloadOn(this.bus, ['dashboard', 'movements'], () => this.resource.reload());
  }

  protected badge(date: string) {
    return dateBadge(parseLocalDate(date));
  }

  protected subtitle(item: UpcomingItem): string {
    if (item.type === 'STATEMENT') return this.texts.statementDue;
    return `${item.kind === 'INCOME' ? this.texts.income : this.texts.fixed} · ${item.accountName}`;
  }
}
