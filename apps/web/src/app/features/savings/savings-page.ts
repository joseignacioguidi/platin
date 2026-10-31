import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Goal } from '@platin/contracts';
import {
  type Currency,
  formatMoney,
  Money,
  parsePeriod,
  type PocketKind,
  progressPercent,
  toDecimal,
} from '@platin/domain';
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
  PlStackTone,
  PL_CURRENCY_NAMES,
  PlErrorState,
  PlSkeleton,
} from '@platin/web-ui';
import { PocketFormData, PocketFormSheet } from '../accounts/pocket-form-sheet';
import { PlanGate, PlUsage } from '../plans/plan-gate';
import { GoalFormSheet } from './goal-form-sheet';
import { SavingsStore } from './savings.store';
import { SAVINGS_TEXTS } from './savings.texts';

/** Color of each currency in the savings bar (the dollar keeps the savings color). */
const CURRENCY_TONES: Record<Currency, PlStackTone> = {
  USD: 'savings',
  ARS: 'brand',
  EUR: 'transfer',
  BRL: 'card',
  CLP: 'pending',
  UYU: 'expense',
};

/** Literal classes so Tailwind generates them. */
const DOT_CLASSES: Record<PlStackTone, string> = {
  savings: 'bg-savings',
  brand: 'bg-brand',
  transfer: 'bg-transfer',
  card: 'bg-card',
  pending: 'bg-pending',
  expense: 'bg-expense',
};

const PACE_CLASS = {
  BEHIND: 'bg-pending text-ink',
  ON_TRACK: 'bg-brand-soft text-brand-strong',
  AHEAD: 'bg-brand-soft text-brand-strong',
} as const;

/** /app/ahorros: total saved in USD, goals and savings and investment pockets (mockup "Ahorros"). */
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
    PlanGate,
    PlUsage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <a plButton="secondary" size="sm" routerLink="/app/inversiones" plPlanGate="investments">
        {{ texts.investments }}
      </a>
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
        <!-- MON-03: what each currency adds, in its own currency. -->
        <ul class="flex flex-wrap justify-between gap-x-4 gap-y-2 text-[15px]">
          @for (line of s.byCurrency; track line.currency) {
            <li class="flex items-center gap-2">
              <span
                class="size-2.5 rounded-full"
                [class]="dotClass(line.currency)"
                aria-hidden="true"
              ></span
              >{{ currencyNames[line.currency] }}
              <pl-money [amount]="line.amount" [currency]="line.currency" [decimals]="false" />
            </li>
          }
        </ul>
      </section>
    }

    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <h2 class="text-xl font-bold">{{ texts.goals }}</h2>
        <div class="flex items-center gap-2">
          <pl-usage resource="goals" />
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong"
            plPlanGate="goals"
            (click)="newGoal()"
          >
            {{ texts.newGoal }}
          </button>
        </div>
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
          <button plButton type="button" plPlanGate="goals" (click)="newGoal()">
            {{ texts.newGoal }}
          </button>
        </pl-empty-state>
      }
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-xl font-bold">{{ texts.accounts }}</h2>
      <ul class="rounded-tile bg-surface px-4">
        @for (pocket of savings()?.pockets ?? []; track pocket.id) {
          <li class="border-b border-line-soft last:border-b-0">
            <a
              [routerLink]="['/app/apartados', pocket.id]"
              class="flex min-h-14 items-center gap-3 rounded-xl"
            >
              <span
                class="size-2.5 rounded-full"
                [class.bg-savings]="pocket.kind === 'SAVINGS'"
                [class.bg-card]="pocket.kind === 'INVESTMENT'"
                aria-hidden="true"
              ></span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-[17px]">{{ pocket.name }}</span>
                <span class="truncate text-sm text-muted">{{ pocket.accountName }}</span>
              </span>
              <pl-money
                class="text-[17px]"
                [amount]="pocket.balance"
                [currency]="pocket.currency"
                [decimals]="false"
              />
            </a>
          </li>
        } @empty {
          <li class="py-4 text-sm text-muted">{{ texts.noAccounts }}</li>
        }
      </ul>
      <div class="flex flex-wrap items-center gap-x-4">
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong"
          plPlanGate="pockets"
          (click)="newPocket('SAVINGS')"
        >
          {{ texts.newSavingsPocket }}
        </button>
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong"
          [plPlanGate]="investmentPocketGate"
          (click)="newPocket('INVESTMENT')"
        >
          {{ texts.newInvestmentPocket }}
        </button>
        <pl-usage resource="pockets" />
      </div>
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

  protected readonly currencyNames = PL_CURRENCY_NAMES;

  /** Each currency's share of the total, by its value in dollars. */
  protected readonly split = computed<PlStackSegment[]>(() =>
    (this.savings()?.byCurrency ?? []).map((line) => ({
      label: PL_CURRENCY_NAMES[line.currency],
      amount: line.valueUsd,
      tone: CURRENCY_TONES[line.currency],
    })),
  );

  protected dotClass(currency: Currency): string {
    return DOT_CLASSES[CURRENCY_TONES[currency]];
  }

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

  /** The plan mark shows the feature first: that's what "Pro" adds. */
  protected readonly investmentPocketGate = ['investments', 'pockets'] as const;

  protected newPocket(kind: PocketKind): void {
    this.sheet.open(PocketFormSheet, {
      data: { kind } satisfies PocketFormData,
      ariaLabel:
        kind === 'INVESTMENT' ? this.texts.newInvestmentPocket : this.texts.newSavingsPocket,
    });
  }

  protected newGoal(): void {
    this.sheet.open(GoalFormSheet, { data: null, ariaLabel: this.texts.form.new });
  }
}
