import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideClock, LucidePencil } from '@lucide/angular';
import type { Goal, GoalProjection } from '@platin/contracts';
import { formatMoney, Money, parsePeriod, progressPercent } from '@platin/domain';
import {
  formatPeriod,
  formatPeriodShort,
  parseTypedAmount,
  PlBottomSheet,
  PlButton,
  PlMoney,
  PlProgress,
  PlErrorState,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { GoalFormSheet } from './goal-form-sheet';
import { SavingsStore } from './savings.store';
import { SAVINGS_TEXTS } from './savings.texts';

/** MET-03/04: ring, saved and remaining, monthly needed, pace and simulator (mockup "Meta"). */
@Component({
  selector: 'pl-goal-detail-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlMoney,
    PlButton,
    PlProgress,
    LucideChevronLeft,
    LucidePencil,
    LucideClock,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between">
      <a routerLink="/app/ahorros" class="flex min-h-11 items-center gap-1 text-[17px] text-muted">
        <svg lucideChevronLeft [size]="22"></svg>{{ t.back }}
      </a>
      @if (goal(); as g) {
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-full hover:bg-field"
          [attr.aria-label]="t.edit"
          (click)="edit(g)"
        >
          <svg lucidePencil [size]="20"></svg>
        </button>
      }
    </header>

    @if (resource.error() && !resource.hasValue()) {
      <pl-error-state (retry)="resource.reload()" />
    } @else if (!resource.hasValue()) {
      <pl-skeleton [heights]="[80, 220, 130, 180]" />
    } @else if (goal(); as g) {
      <div class="flex flex-col gap-1">
        <h1 class="text-4xl font-bold">{{ g.name }}</h1>
        <p class="text-[15px] text-muted">
          <pl-money
            class="text-ink"
            [amount]="g.targetAmount"
            [currency]="g.currency"
            [decimals]="false"
          />
          {{ t.for }} {{ periodLong(g.targetPeriod) }}
        </p>
      </div>

      <section class="flex items-center gap-6 rounded-card bg-surface p-5">
        <pl-progress
          variant="ring"
          [value]="percent()"
          [tone]="g.currency === 'USD' ? 'savings' : 'brand'"
          [label]="g.name"
        />
        <dl class="flex flex-col gap-3">
          <div>
            <dt class="text-sm text-muted">{{ t.saved }}</dt>
            <dd>
              <pl-money
                class="text-2xl font-semibold"
                [amount]="g.projection.accumulated"
                [currency]="g.currency"
                [decimals]="false"
              />
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">{{ t.remaining }}</dt>
            <dd>
              <pl-money
                class="text-2xl font-semibold"
                [amount]="g.projection.remaining"
                [currency]="g.currency"
                [decimals]="false"
              />
            </dd>
          </div>
        </dl>
      </section>

      @if (g.projection.remaining !== '0.00') {
        <section class="flex flex-col gap-2 rounded-card bg-ink p-5 text-on-ink">
          <span class="text-[15px] opacity-80">{{ t.needs(g.projection.monthsLeft) }}</span>
          <span class="font-amount text-5xl font-semibold text-savings">
            <pl-money
              [amount]="g.projection.monthlyNeeded"
              [currency]="g.currency"
              [decimals]="false"
            /><span class="text-xl">/mes</span>
          </span>
        </section>

        <section
          class="flex items-center gap-3 rounded-tile p-4"
          [class]="g.projection.pace === 'BEHIND' ? 'bg-pending-soft' : 'bg-brand-soft'"
        >
          <svg lucideClock [size]="24" class="shrink-0"></svg>
          <div class="flex flex-col">
            <span class="font-semibold">{{ paceTitle(g) }}</span>
            <span class="text-sm">{{ t.expected(money(g.projection.expectedToDate, g)) }}</span>
          </div>
        </section>

        <section class="flex flex-col gap-3 rounded-card bg-surface p-5">
          <h2 class="text-[17px] font-semibold">{{ t.simulate }}</h2>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <label class="flex items-center gap-3">
              <span class="text-muted">{{ t.contribution }}</span>
              <span
                class="font-amount flex min-h-12 items-center gap-2 rounded-2xl border border-line px-4"
              >
                {{ g.currency }}
                <input
                  type="text"
                  inputmode="decimal"
                  class="font-amount w-24 bg-transparent outline-none"
                  [value]="monthlyText()"
                  (input)="setMonthly($event)"
                  [attr.aria-label]="t.contribution"
                />
              </span>
            </label>
            @if (simulation(); as sim) {
              <span class="text-[15px]"
                >{{ t.reachIn }} <strong>{{ periodShort(sim.reachedIn) }}</strong></span
              >
            }
          </div>
          @if (simulation(); as sim) {
            <p
              class="text-sm font-semibold"
              [class.text-brand-strong]="sim.monthsBeforeTarget >= 0"
              [class.text-ink]="sim.monthsBeforeTarget < 0"
            >
              {{ simulationText(sim.monthsBeforeTarget) }}
            </p>
          }
        </section>
      } @else {
        <p class="rounded-tile bg-brand-soft p-4 font-semibold text-brand-strong">
          {{ t.reached }}
        </p>
      }

      <section class="flex flex-col gap-2">
        <h2 class="text-[17px] font-semibold">{{ t.linked }}</h2>
        @if (g.pockets.length > 0) {
          <ul class="rounded-tile bg-surface px-4">
            @for (pocket of g.pockets; track pocket.id) {
              <li class="border-b border-line-soft last:border-b-0">
                <a
                  [routerLink]="['/app/apartados', pocket.id]"
                  class="flex min-h-14 items-center gap-3 rounded-xl"
                >
                  <span class="size-2.5 rounded-full bg-savings" aria-hidden="true"></span>
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
            }
          </ul>
        } @else {
          <p class="rounded-tile bg-surface p-4 text-[15px] text-muted">{{ t.noPockets }}</p>
        }
      </section>

      <div class="grid grid-cols-2 gap-2">
        @if (g.status === 'ACTIVE') {
          <button plButton="secondary" type="button" (click)="setStatus(g, 'ACHIEVED')">
            {{ t.markAchieved }}
          </button>
          <button plButton="danger" type="button" (click)="setStatus(g, 'CANCELLED')">
            {{ t.cancel }}
          </button>
        } @else {
          <button plButton="secondary" type="button" (click)="setStatus(g, 'ACTIVE')">
            {{ t.reactivate }}
          </button>
        }
      </div>
    }
  `,
})
export class GoalDetailPage {
  readonly id = input.required<string>();

  protected readonly t = SAVINGS_TEXTS.detail;
  private readonly store = inject(SavingsStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);

  protected readonly resource = httpResource<Goal>(() => `${API}/goals/${this.id()}`);
  protected readonly goal = computed(() => this.resource.value());
  protected readonly percent = computed(() =>
    progressPercent(this.goal()?.projection.progress ?? '0'),
  );

  protected readonly monthlyText = signal('');
  private readonly monthly = computed(() => parseTypedAmount(this.monthlyText()));
  private readonly simulationResource = httpResource<GoalProjection>(() => {
    const monthly = this.monthly();
    return monthly
      ? { url: `${API}/goals/${this.id()}/projection`, params: { monthly } }
      : undefined;
  });
  protected readonly simulation = computed(() =>
    this.monthly() ? this.simulationResource.value()?.simulation : undefined,
  );

  constructor() {
    reloadOn(this.bus, ['goals', 'accounts'], () => this.resource.reload());
  }

  protected setMonthly(event: Event): void {
    this.monthlyText.set((event.target as HTMLInputElement).value);
  }

  protected periodLong(period: string): string {
    return formatPeriod(parsePeriod(period)).toLowerCase();
  }

  protected periodShort(period: string): string {
    return formatPeriodShort(parsePeriod(period));
  }

  protected money(amount: string, goal: Goal): string {
    return formatMoney(Money.of(amount, goal.currency), { decimals: false });
  }

  protected paceTitle(goal: Goal): string {
    const diff = this.money(goal.projection.paceDifference, goal);
    if (goal.projection.pace === 'BEHIND') return this.t.behind(diff);
    if (goal.projection.pace === 'AHEAD') return this.t.ahead(diff);
    return this.t.onTrack;
  }

  protected simulationText(monthsBeforeTarget: number): string {
    if (monthsBeforeTarget > 0) return this.t.monthsEarly(monthsBeforeTarget);
    if (monthsBeforeTarget < 0) return this.t.monthsLate(-monthsBeforeTarget);
    return this.t.onTime;
  }

  protected edit(goal: Goal): void {
    this.sheet.open(GoalFormSheet, { data: goal, ariaLabel: this.t.edit });
  }

  protected async setStatus(
    goal: Goal,
    status: 'ACTIVE' | 'ACHIEVED' | 'CANCELLED',
  ): Promise<void> {
    await this.store.update(goal.id, { status });
  }
}
