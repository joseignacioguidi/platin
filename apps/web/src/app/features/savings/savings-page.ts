import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Goal } from '@platin/contracts';
import { formatMoney, Money, parsePeriod, progressPercent, toDecimal } from '@platin/domain';
import {
  displayAmount,
  formatPeriodShort,
  PlBottomSheet,
  PlButton,
  PlEmptyState,
  PlMoney,
  PlProgress,
  PlStackedBar,
  PlStackSegment,
  PlErrorState,
  PlSkeleton,
} from '@platin/web-ui';
import { GoalFormSheet } from './goal-form-sheet';
import { SavingsStore } from './savings.store';
import { SAVINGS_TEXTS } from './savings.texts';

const PACE_CLASS = {
  BEHIND: 'bg-pending text-ink',
  ON_TRACK: 'bg-brand-soft text-brand-strong',
  AHEAD: 'bg-brand-soft text-brand-strong',
} as const;

/** /app/ahorros: total saved in USD, goals and savings accounts (mockup "Ahorros"). */
@Component({
  selector: 'pl-savings-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlMoney,
    PlButton,
    PlEmptyState,
    PlProgress,
    PlStackedBar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <button
        plButton="secondary"
        size="sm"
        type="button"
        disabled
        [attr.title]="texts.investmentsSoon"
      >
        {{ texts.investments }}
      </button>
    </header>

    @if (store.savingsResource.error() && !store.savingsResource.hasValue()) {
      <pl-error-state (retry)="store.savingsResource.reload()" />
    } @else if (!store.savingsResource.hasValue()) {
      <pl-skeleton [heights]="[200, 110, 110]" />
    }
    @if (savings(); as s) {
      <section
        class="flex flex-col gap-4 rounded-card bg-ink p-5 text-on-ink"
        [attr.aria-label]="texts.total"
      >
        <div class="flex flex-col gap-1">
          <span class="text-[15px] opacity-80">{{ texts.total }}</span>
          <pl-money
            class="text-4xl font-semibold tracking-tight"
            [amount]="s.totalUsd"
            currency="USD"
            [decimals]="false"
          />
          @if (approx()) {
            <span class="font-amount text-sm opacity-80">{{ approx() }}</span>
          }
        </div>
        <pl-stacked-bar [segments]="split()" />
        <div class="flex flex-wrap justify-between gap-2 text-[15px]">
          <span class="flex items-center gap-2">
            <span class="size-2.5 rounded-full bg-savings" aria-hidden="true"></span
            >{{ texts.dollars }}
            <pl-money [amount]="s.usd" currency="USD" [decimals]="false" />
          </span>
          <span class="flex items-center gap-2">
            <span class="size-2.5 rounded-full bg-brand" aria-hidden="true"></span>{{ texts.pesos }}
            <pl-money [amount]="s.ars" [decimals]="false" />
          </span>
        </div>
      </section>
    }

    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <h2 class="text-xl font-bold">{{ texts.goals }}</h2>
        <button type="button" class="min-h-11 font-semibold text-brand-strong" (click)="newGoal()">
          {{ texts.newGoal }}
        </button>
      </div>
      @for (goal of store.goals(); track goal.id) {
        <a
          [routerLink]="['/app/metas', goal.id]"
          class="flex flex-col gap-3 rounded-tile bg-surface p-4"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-[17px] font-semibold">{{ goal.name }}</span>
            <span
              class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
              [class]="badgeClass(goal)"
            >
              {{ badge(goal) }}
            </span>
          </div>
          <pl-progress
            [value]="percent(goal)"
            [tone]="goal.currency === 'USD' ? 'savings' : 'brand'"
            [label]="goal.name"
          />
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span class="font-amount text-[15px]">
              <pl-money
                [amount]="goal.projection.accumulated"
                [currency]="goal.currency"
                [decimals]="false"
              />
              <span class="text-muted"> / {{ target(goal) }}</span>
            </span>
            <span class="text-sm text-muted">{{ monthlyLine(goal) }}</span>
          </div>
        </a>
      } @empty {
        <pl-empty-state
          icon="piggy-bank"
          [heading]="texts.noGoalsTitle"
          [description]="texts.noGoalsBody"
        >
          <button plButton type="button" (click)="newGoal()">{{ texts.newGoal }}</button>
        </pl-empty-state>
      }
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">{{ texts.accounts }}</h2>
      <ul class="rounded-tile bg-surface px-4">
        @for (account of savings()?.accounts ?? []; track account.id) {
          <li class="flex min-h-14 items-center gap-3 border-b border-line-soft last:border-b-0">
            <span class="size-2.5 rounded-full bg-transfer" aria-hidden="true"></span>
            <a [routerLink]="['/app/cuentas', account.id]" class="flex-1 truncate text-[17px]">{{
              account.name
            }}</a>
            <pl-money
              class="text-[17px]"
              [amount]="account.balance"
              [currency]="account.currency"
              [decimals]="false"
            />
          </li>
        } @empty {
          <li class="py-4 text-sm text-muted">{{ texts.noAccounts }}</li>
        }
      </ul>
    </section>
  `,
})
export class SavingsPage {
  protected readonly texts = SAVINGS_TEXTS;
  protected readonly store = inject(SavingsStore);
  private readonly sheet = inject(PlBottomSheet);

  protected readonly savings = computed(() => this.store.savingsResource.value());

  protected readonly approx = computed(() => {
    const s = this.savings();
    if (!s?.rate) return null;
    return this.texts.approx(
      formatMoney(Money.of(s.totalArs, 'ARS'), { decimals: false }),
      s.rate.type,
      formatMoney(Money.of(s.rate.sell, 'ARS'), { decimals: 'auto' }),
    );
  });

  protected readonly split = computed<PlStackSegment[]>(() => {
    const s = this.savings();
    if (!s) return [];
    return [
      { label: this.texts.dollars, amount: s.usd, tone: 'savings' },
      { label: this.texts.pesos, amount: s.arsInUsd, tone: 'brand' },
    ];
  });

  protected percent(goal: Goal): number {
    return progressPercent(goal.projection.progress);
  }

  protected target(goal: Goal): string {
    return displayAmount(toDecimal(goal.targetAmount).toFixed(0));
  }

  protected badge(goal: Goal): string {
    if (goal.status !== 'ACTIVE') return this.texts.status[goal.status];
    return this.texts.pace[goal.projection.pace];
  }

  protected badgeClass(goal: Goal): string {
    if (goal.status !== 'ACTIVE') return 'bg-field text-muted';
    return PACE_CLASS[goal.projection.pace];
  }

  protected monthlyLine(goal: Goal): string {
    const monthly = formatMoney(Money.of(goal.projection.monthlyNeeded, goal.currency), {
      decimals: false,
    });
    return `${monthly}${this.texts.perMonth} · ${formatPeriodShort(parsePeriod(goal.targetPeriod))}`;
  }

  protected newGoal(): void {
    this.sheet.open(GoalFormSheet, { data: null, ariaLabel: this.texts.form.new });
  }
}
