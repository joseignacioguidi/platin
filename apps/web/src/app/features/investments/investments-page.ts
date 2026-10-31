import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideRefreshCw } from '@lucide/angular';
import type { Instrument, InvestmentPocket } from '@platin/contracts';
import { daysBetween, parseLocalDate } from '@platin/domain';
import {
  HideAmounts,
  moneyText,
  PlBottomSheet,
  PL_CURRENCY_NAMES,
  PlButton,
  PlEmptyState,
  PlErrorState,
  PlMoney,
  PlSkeleton,
  PlStackedBar,
  PlStackSegment,
} from '@platin/web-ui';
import { Today } from '../../core/today';
import { ACCOUNTS_TEXTS } from '../accounts/accounts.texts';
import { PocketFormData, PocketFormSheet } from '../accounts/pocket-form-sheet';
import { PlanGate } from '../plans/plan-gate';
import { formatRate, INSTRUMENT_TONES, TONE_BG } from './investment-format';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';

/** INV-05: value, yield and composition of the investments (mockup "Inversiones"). */
@Component({
  selector: 'pl-investments-page',
  imports: [
    RouterLink,
    PlButton,
    PlMoney,
    PlEmptyState,
    PlErrorState,
    PlSkeleton,
    PlStackedBar,
    LucideChevronLeft,
    LucideRefreshCw,
    PlanGate,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center gap-2">
      <a
        routerLink="/app/ahorros"
        class="flex size-11 items-center justify-center rounded-full hover:bg-field"
        [attr.aria-label]="t.back"
      >
        <svg lucideChevronLeft [size]="24"></svg>
      </a>
      <h1 class="text-3xl font-bold">{{ t.title }}</h1>
    </header>

    @if (store.resource.error() && !store.resource.hasValue()) {
      <pl-error-state (retry)="store.resource.reload()" />
    } @else if (!data()) {
      <pl-skeleton [heights]="[220, 90, 72, 72]" />
    } @else if (store.pockets().length === 0) {
      <pl-empty-state icon="trending-up" [heading]="t.emptyTitle" [description]="t.emptyBody">
        <button plButton type="button" [plPlanGate]="pocketGate" (click)="newPocket()">
          {{ t.newPocket }}
        </button>
      </pl-empty-state>
    } @else if (data(); as d) {
      <section class="flex flex-col gap-4 rounded-card bg-surface p-5" [attr.aria-label]="t.value">
        <div class="flex flex-col gap-2">
          <span class="text-[15px] text-muted">{{ t.value }}</span>
          <pl-money
            class="text-4xl font-semibold tracking-tight"
            [amount]="d.base.value"
            [currency]="d.base.currency"
            [decimals]="false"
          />
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              class="font-amount rounded-xl px-3 py-1.5 text-[15px] font-semibold"
              [class]="positive() ? 'bg-brand-soft text-brand-strong' : 'bg-expense-soft text-ink'"
            >
              {{ positive() ? '+' : '−' }}
              <pl-money
                [amount]="absYield()"
                [currency]="d.base.currency"
                [decimals]="false"
                sign="never"
              />
              @if (d.base.yieldRate) {
                · {{ rate(d.base.yieldRate) }}
              }
            </span>
            <span class="text-[15px] text-muted">{{ overText() }}</span>
          </div>
        </div>
        @if (d.totals.length > 1 || d.totals[0]?.currency !== d.base.currency) {
          <!-- MON-03: the value in each currency; the big number above is the total valued. -->
          <ul
            class="flex flex-col gap-1 border-t border-line-soft pt-3"
            [attr.aria-label]="t.byCurrency"
          >
            @for (line of d.totals; track line.currency) {
              <li class="flex items-baseline justify-between gap-3 text-[15px]">
                <span class="text-muted">{{ currencyNames[line.currency] }}</span>
                <pl-money [amount]="line.value" [currency]="line.currency" [decimals]="false" />
              </li>
            }
          </ul>
        }
        @if (composition().length > 0) {
          <pl-stacked-bar [segments]="composition()" />
          <ul class="flex flex-wrap gap-x-5 gap-y-1 text-[15px]" [attr.aria-label]="t.composition">
            @for (part of composition(); track part.label) {
              <li class="flex items-center gap-2">
                <span
                  class="size-2.5 rounded-full"
                  [class]="toneBg[part.tone]"
                  aria-hidden="true"
                ></span>
                {{ part.label }}
              </li>
            }
          </ul>
        }
      </section>

      <section class="flex items-center gap-3 rounded-card border border-dashed border-line p-4">
        <svg lucideRefreshCw [size]="22" class="shrink-0 text-muted" aria-hidden="true"></svg>
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="font-semibold">{{ t.manual }}</span>
          <span class="text-sm text-muted">{{ lastUpdateText() }}</span>
        </div>
        <a
          plButton="secondary"
          size="sm"
          routerLink="/app/inversiones/actualizar"
          [attr.aria-label]="t.updateLabel"
          >{{ t.update }}</a
        >
      </section>

      @for (account of d.accounts; track account.id) {
        <section class="flex flex-col gap-2">
          <h2 class="text-xl font-bold">{{ account.name }}</h2>
          <ul class="rounded-tile bg-surface px-4">
            @for (pocket of account.pockets; track pocket.id) {
              <li class="border-b border-line-soft last:border-b-0">
                <a
                  [routerLink]="['/app/apartados', pocket.id]"
                  class="flex min-h-[72px] items-center gap-3 rounded-xl py-3"
                  [attr.aria-label]="t.openPocket(pocket.name)"
                >
                  <span
                    class="h-11 w-1.5 shrink-0 rounded-full"
                    [class]="toneBg[tone(pocket.instrument)]"
                    aria-hidden="true"
                  ></span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-[17px] font-semibold">{{ pocket.name }}</span>
                    <span class="truncate text-sm text-muted">{{ subtitle(pocket) }}</span>
                  </span>
                  <span class="flex flex-col items-end">
                    <pl-money
                      class="text-[17px]"
                      [amount]="pocket.summary.value"
                      [currency]="pocket.currency"
                      [decimals]="false"
                    />
                    @if (pocket.summary.yieldRate) {
                      <span
                        class="font-amount text-sm"
                        [class.text-brand-strong]="!pocket.summary.yieldRate.startsWith('-')"
                        >{{ rate(pocket.summary.yieldRate) }}</span
                      >
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
})
export class InvestmentsPage {
  protected readonly t = INVESTMENTS_TEXTS;
  protected readonly toneBg = TONE_BG;
  protected readonly store = inject(InvestmentsStore);
  private readonly today = inject(Today);
  private readonly hideAmounts = inject(HideAmounts);
  private readonly sheet = inject(PlBottomSheet);
  protected readonly currencyNames = PL_CURRENCY_NAMES;
  protected readonly pocketGate = ['investments', 'pockets'] as const;

  protected newPocket(): void {
    this.sheet.open(PocketFormSheet, {
      data: { kind: 'INVESTMENT' } satisfies PocketFormData,
      ariaLabel: this.t.newPocket,
    });
  }

  protected readonly data = computed(() => this.store.investments());
  protected readonly positive = computed(() => !this.data()?.base.yield.startsWith('-'));
  protected readonly absYield = computed(() => this.data()?.base.yield.replace('-', '') ?? '0');
  protected readonly overText = computed(() => {
    const d = this.data();
    if (!d) return '';
    return this.t.over(moneyText(d.base.invested, d.base.currency, this.hideAmounts.hidden()));
  });
  protected readonly lastUpdateText = computed(() => {
    const last = this.data()?.lastValuationDate;
    if (!last) return this.t.never;
    return this.t.lastUpdate(this.t.daysAgo(daysBetween(parseLocalDate(last), this.today.date())));
  });
  protected readonly composition = computed<PlStackSegment[]>(() =>
    (this.data()?.base.byInstrument ?? []).map((part) => ({
      label: ACCOUNTS_TEXTS.instruments[part.instrument],
      amount: part.value,
      tone: INSTRUMENT_TONES[part.instrument],
    })),
  );

  protected tone(instrument: Instrument | null) {
    return INSTRUMENT_TONES[instrument ?? 'OTHER'];
  }

  protected rate(value: string): string {
    return formatRate(value);
  }

  protected subtitle(pocket: InvestmentPocket): string {
    const instrument = ACCOUNTS_TEXTS.instruments[pocket.instrument ?? 'OTHER'];
    const invested = moneyText(pocket.summary.invested, pocket.currency, this.hideAmounts.hidden());
    return `${instrument} · ${this.t.invested(invested)}`;
  }
}
