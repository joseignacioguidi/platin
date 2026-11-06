import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucidePencil,
  LucidePlus,
  LucideShoppingBag,
} from '@lucide/angular';
import type {
  Card,
  InstallmentStatement,
  StatementDetail,
  StatementPlanInstallment,
  StatementSummary,
} from '@platin/contracts';
import {
  addMonths,
  compareDates,
  Money,
  parseLocalDate,
  parsePeriod,
  toDecimal,
} from '@platin/domain';
import {
  formatDate,
  formatPeriod,
  HideAmounts,
  PlChartPoint,
  PlBottomSheet,
  PlButton,
  PlEmptyState,
  PlListItem,
  PlMoney,
  PlSegmented,
  PlSegmentOption,
  PlErrorState,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { Today } from '../../core/today';
import { CardFormSheet } from './card-form-sheet';
import { CardVisual } from './card-visual';
import { ChargeFormData, ChargeFormSheet } from './charge-form-sheet';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';
import { CHART_PAGE, clampStart, nextToPayIndex, pageStartFor } from './installments-tab';
import { CloseStatementSheet } from './close-statement-sheet';
import { PayStatementSheet } from './pay-statement-sheet';
import { StatementDetailData, StatementDetailSheet } from './statement-detail-sheet';

const HISTORY_PAGE = 12;

type Tab = 'summary' | 'upcoming' | 'installments';

const MONTHS_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const MONTHS_LONG = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** TAR-04/05: the card, its statements and its installment plans (mockup "Tarjeta con cuotas"). */
@Component({
  selector: 'pl-card-detail-page',
  imports: [
    PlChartPoint,
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlButton,
    PlMoney,
    PlSegmented,
    PlListItem,
    PlEmptyState,
    CardVisual,
    LucideChevronLeft,
    LucidePlus,
    LucidePencil,
    LucideShoppingBag,
    LucideChevronRight,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (cardResource.error() && !cardResource.hasValue()) {
      <pl-error-state (retry)="cardResource.reload()" />
    } @else if (!cardResource.hasValue()) {
      <pl-skeleton [heights]="[56, 220, 48, 240]" />
    } @else if (card(); as card) {
      <header class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1">
          <a
            routerLink="/app/tarjetas"
            class="flex size-11 items-center justify-center rounded-full hover:bg-field"
            [attr.aria-label]="texts.back"
          >
            <svg lucideChevronLeft [size]="24"></svg>
          </a>
          <h1 class="truncate text-xl font-bold">{{ card.name }}</h1>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full text-muted hover:bg-field"
            [attr.aria-label]="texts.edit"
            (click)="edit(card)"
          >
            <svg lucidePencil [size]="18"></svg>
          </button>
        </div>
        <button
          plButton
          size="sm"
          type="button"
          [attr.aria-label]="texts.addChargeLabel"
          (click)="addCharge(card)"
        >
          <svg lucidePlus [size]="18"></svg>{{ texts.addCharge }}
        </button>
      </header>

      <pl-card-visual [card]="card" />

      <a
        [routerLink]="['/app/tarjetas', card.id, 'compras']"
        class="flex min-h-11 items-center justify-between rounded-tile bg-surface px-4 py-3 font-medium"
        [attr.aria-label]="texts.purchasesLabel(card.name)"
      >
        <span class="flex items-center gap-3">
          <svg lucideShoppingBag [size]="20" class="text-muted" aria-hidden="true"></svg>
          {{ texts.purchases }}
        </span>
        <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
      </a>

      @if (card.creditLimit) {
        <section class="flex flex-col gap-2" [attr.aria-label]="texts.available">
          <div class="flex justify-between text-[15px] text-muted">
            <span
              >{{ texts.available }} <pl-money class="text-ink" [amount]="card.available ?? '0'"
            /></span>
            <span>{{ texts.limit }} <pl-money [amount]="card.creditLimit" /></span>
          </div>
          <div class="rounded-full py-2" [plChartPoint]="texts.used" [amount]="card.committedArs">
            <div
              class="h-2 overflow-hidden rounded-full bg-line"
              role="progressbar"
              [attr.aria-valuenow]="usedPercent()"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="h-full rounded-full bg-ink" [style.width.%]="usedPercent()"></div>
            </div>
          </div>
        </section>
      }

      <pl-segmented [label]="texts.tabsLabel" tone="surface" [options]="tabs" [(value)]="tab" />

      @switch (tab()) {
        @case ('summary') {
          @for (statement of toPay(); track statement.id) {
            <section
              class="flex items-center justify-between gap-3 rounded-tile bg-pending-soft p-4"
            >
              <div class="flex flex-col">
                <span class="font-semibold"
                  >{{ texts.toPay }} · {{ periodLabel(statement.period) }}</span
                >
                <span class="text-sm text-pending-ink"
                  >{{ texts.due }} {{ dateText(statement.dueDate) }}</span
                >
                <span class="font-amount">
                  <pl-money [amount]="statement.pending.ARS" />
                  @if (statement.pending.USD !== '0.00') {
                    + <pl-money [amount]="statement.pending.USD" currency="USD" />
                  }
                </span>
              </div>
              <button plButton type="button" (click)="pay(card, statement)">
                {{ texts.payStatement }}
              </button>
            </section>
          }
          <section class="flex flex-col gap-1 rounded-tile bg-surface px-4 py-2">
            @for (item of openDetail()?.installments ?? []; track item.id) {
              <button
                type="button"
                class="-mx-2 rounded-2xl px-2 text-left hover:bg-field"
                [attr.aria-label]="texts.editChargeLabel(item.description)"
                (click)="editCharge(card, item.chargeId)"
              >
                <pl-list-item
                  [heading]="item.description"
                  [subtitle]="
                    item.count > 1
                      ? texts.installmentOf(item.number, item.count)
                      : item.category.name
                  "
                  [icon]="item.category.icon"
                  tone="card"
                >
                  <pl-money class="text-[17px]" [amount]="item.amount" [currency]="item.currency" />
                </pl-list-item>
              </button>
            } @empty {
              <p class="py-4 text-center text-[15px] text-muted">{{ texts.noCharges }}</p>
            }
            @for (adjustment of openDetail()?.adjustments ?? []; track adjustment.id) {
              <pl-list-item
                [heading]="adjustment.description ?? texts.adjustment"
                [subtitle]="adjustment.category.name"
                icon="percent"
                tone="muted"
              >
                <pl-money [amount]="adjustment.amount" [currency]="adjustment.currency" />
              </pl-list-item>
            }
          </section>
          @if (chargeError()) {
            <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">
              {{ chargeError() }}
            </p>
          }
          @if (card.openStatement; as open) {
            <button plButton="secondary" type="button" (click)="close(open)">
              {{ texts.closeStatement }}
            </button>
          }

          <!-- TAR-12: the open statement above, the previous ones below. -->
          <section class="flex flex-col gap-2" aria-labelledby="statement-history">
            <h2 id="statement-history" class="text-lg font-bold">{{ texts.history.title }}</h2>
            <ul class="rounded-tile bg-surface px-4">
              @for (statement of history(); track statement.id) {
                <li class="border-b border-line-soft last:border-b-0">
                  <button
                    type="button"
                    class="flex min-h-16 w-full items-center justify-between gap-3 py-2 text-left"
                    [attr.aria-label]="texts.history.open(periodLabel(statement.period))"
                    (click)="openStatement(card, statement)"
                  >
                    <span class="flex min-w-0 flex-col">
                      <span class="font-semibold">{{ periodLabel(statement.period) }}</span>
                      <span class="text-sm text-muted"
                        >{{ texts.due }} {{ dateText(statement.dueDate) }} ·
                        {{ texts.status[statement.status] }}</span
                      >
                    </span>
                    <span class="font-amount flex flex-col items-end">
                      <pl-money [amount]="statement.totals.ARS" />
                      @if (statement.totals.USD !== '0.00') {
                        <pl-money class="text-sm" [amount]="statement.totals.USD" currency="USD" />
                      }
                    </span>
                  </button>
                </li>
              } @empty {
                @if (!historyLoading()) {
                  <li class="py-4 text-sm text-muted">{{ texts.history.empty }}</li>
                }
              }
            </ul>
            @if (historyError()) {
              <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">
                {{ historyError() }}
              </p>
            }
            @if (historyCursor()) {
              <button
                type="button"
                class="min-h-11 self-center text-sm font-semibold text-brand-strong"
                [disabled]="historyLoading()"
                (click)="loadHistory(false)"
              >
                {{ texts.history.more }}
              </button>
            }
          </section>
        }
        @case ('upcoming') {
          <ul class="rounded-tile bg-surface px-4">
            @for (statement of upcoming(); track statement.id) {
              <li
                class="flex min-h-16 items-center justify-between gap-3 border-b border-line-soft last:border-b-0"
              >
                <div class="flex flex-col">
                  <span class="font-semibold">{{ periodLabel(statement.period) }}</span>
                  <span class="text-sm text-muted"
                    >{{ texts.due }} {{ dateText(statement.dueDate) }}</span
                  >
                </div>
                <span class="font-amount flex flex-col items-end">
                  <pl-money [amount]="statement.totals.ARS" />
                  @if (statement.totals.USD !== '0.00') {
                    <pl-money class="text-sm" [amount]="statement.totals.USD" currency="USD" />
                  }
                </span>
              </li>
            }
          </ul>
        }
        @case ('installments') {
          @if (summaryResource.error()) {
            <pl-error-state
              [message]="texts.installmentsTab.loadError"
              (retry)="summaryResource.reload()"
            />
          } @else if (summaryResource.hasValue() && summary().length === 0) {
            <pl-empty-state icon="credit-card" [heading]="texts.installmentsTab.none" />
          } @else {
            <section class="flex flex-col gap-3 rounded-tile bg-surface p-4">
              <h2 class="text-[17px] font-semibold">{{ texts.installmentsByStatement }}</h2>
              <div class="flex items-end gap-1">
                <button
                  type="button"
                  class="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full text-ink hover:bg-field disabled:opacity-30"
                  [attr.aria-label]="texts.installmentsTab.previous"
                  [disabled]="pageStart() === 0"
                  (click)="movePage(-1)"
                >
                  <svg lucideChevronLeft [size]="20" aria-hidden="true"></svg>
                </button>
                <div class="flex h-36 min-w-0 flex-1 items-end gap-1.5">
                  @for (bar of bars(); track bar.period) {
                    <button
                      type="button"
                      class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-xl"
                      [attr.aria-pressed]="bar.period === selectedPeriod()"
                      [plChartPoint]="bar.label"
                      [amount]="bar.amount"
                      (click)="select(bar.period)"
                    >
                      <span
                        class="font-amount text-xs"
                        [class.font-semibold]="bar.period === selectedPeriod()"
                        aria-hidden="true"
                        >{{ hideAmounts.hidden() ? '•••' : bar.short }}</span
                      >
                      <span
                        class="w-full rounded-xl"
                        [class.bg-card]="bar.period === selectedPeriod()"
                        [class.bg-card-muted]="bar.period !== selectedPeriod()"
                        [style.height.px]="bar.height"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="text-xs"
                        [class.font-semibold]="bar.period === selectedPeriod()"
                        [class.text-muted]="bar.period !== selectedPeriod()"
                        aria-hidden="true"
                        >{{ bar.month }}</span
                      >
                    </button>
                  }
                </div>
                <button
                  type="button"
                  class="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full text-ink hover:bg-field disabled:opacity-30"
                  [attr.aria-label]="texts.installmentsTab.next"
                  [disabled]="pageStart() + chartPage >= summary().length"
                  (click)="movePage(1)"
                >
                  <svg lucideChevronRight [size]="20" aria-hidden="true"></svg>
                </button>
              </div>
            </section>
            @if (selected(); as chosen) {
              <section class="rounded-tile bg-surface px-4" aria-live="polite">
                <div class="flex flex-col gap-1 border-b border-line-soft py-4">
                  <div class="flex items-center justify-between gap-2">
                    <h3 class="text-[17px] font-semibold">
                      {{ monthName(chosen.period) }} ·
                      <pl-money [amount]="chosen.installmentsTotal.ARS" currency="ARS" />
                      @if (hasUsd(chosen.installmentsTotal)) {
                        + <pl-money [amount]="chosen.installmentsTotal.USD" currency="USD" />
                      }
                      <span class="font-normal text-muted">{{
                        texts.installmentsTab.inCount(chosen.installmentsCount)
                      }}</span>
                    </h3>
                    @if (chosen.status === 'PAID') {
                      <span
                        class="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong"
                        >{{ texts.installmentsTab.paid }}</span
                      >
                    }
                  </div>
                  @if (hasArs(chosen.releases) || hasUsd(chosen.releases)) {
                    <p class="text-sm font-semibold text-brand-strong">
                      {{ texts.installmentsTab.releasesFrom }}
                      @if (hasArs(chosen.releases)) {
                        <pl-money [amount]="chosen.releases.ARS" currency="ARS" />
                      }
                      @if (hasArs(chosen.releases) && hasUsd(chosen.releases)) {
                        +
                      }
                      @if (hasUsd(chosen.releases)) {
                        <pl-money [amount]="chosen.releases.USD" currency="USD" />
                      }
                      {{ texts.installmentsTab.from(nextMonthName(chosen.period)) }}
                    </p>
                  }
                </div>
                @if (itemsResource.error()) {
                  <pl-error-state
                    [message]="texts.installmentsTab.loadError"
                    (retry)="itemsResource.reload()"
                  />
                } @else if (!itemsResource.hasValue()) {
                  <pl-skeleton class="my-4 block h-16" />
                } @else {
                  @for (item of items(); track item.chargeId) {
                    <div class="flex flex-col gap-2 border-b border-line-soft py-4 last:border-b-0">
                      <div class="flex items-baseline justify-between gap-2">
                        <span class="truncate text-[17px] font-semibold">{{ item.description }}</span>
                        <pl-money
                          class="whitespace-nowrap"
                          [amount]="item.amount"
                          [currency]="item.currency"
                        />
                      </div>
                      @if (item.count > 1) {
                        <div
                          class="rounded-full py-2"
                          [plChartPoint]="item.description"
                          [value]="texts.installmentsTab.installment(item.number, item.count)"
                        >
                          <div
                            class="h-2 overflow-hidden rounded-full bg-card-soft"
                            role="progressbar"
                            [attr.aria-label]="item.description"
                            [attr.aria-valuenow]="item.paidThrough"
                            aria-valuemin="0"
                            [attr.aria-valuemax]="item.count"
                            [attr.aria-valuetext]="
                              texts.installmentsTab.installment(item.number, item.count)
                            "
                          >
                            <div
                              class="h-full rounded-full bg-card"
                              [style.width.%]="(item.paidThrough / item.count) * 100"
                            ></div>
                          </div>
                        </div>
                        <div class="flex justify-between gap-2 text-sm text-muted">
                          <span class="font-amount whitespace-nowrap">{{
                            texts.installmentsTab.installment(item.number, item.count)
                          }}</span>
                          <span class="text-right"
                            >{{ texts.installmentsTab.remainingAfter }}
                            <pl-money [amount]="item.remainingAfter" [currency]="item.currency" />
                            {{ texts.installmentsTab.after(monthName(chosen.period, true)) }}</span
                          >
                        </div>
                      } @else {
                        <span class="text-sm text-muted">{{ texts.installmentsTab.onePayment }}</span>
                      }
                    </div>
                  } @empty {
                    <p class="py-6 text-center text-muted">{{ texts.installmentsTab.empty }}</p>
                  }
                }
              </section>
            }
          }
        }
      }
    }
  `,
})
export class CardDetailPage {
  readonly id = input.required<string>();
  /** `?period=2026-12`: the statement chosen in the "Cuotas" tab, kept on reload and "back". */
  readonly period = input<string>();

  protected readonly texts = CARDS_TEXTS;
  protected readonly hideAmounts = inject(HideAmounts);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);
  private readonly store = inject(CardsStore);
  protected readonly chargeError = signal<string | null>(null);

  protected readonly tabs: PlSegmentOption<Tab>[] = [
    { value: 'summary', label: CARDS_TEXTS.tabs.summary },
    { value: 'upcoming', label: CARDS_TEXTS.tabs.upcoming },
    { value: 'installments', label: CARDS_TEXTS.tabs.installments },
  ];
  /** Opens on "Cuotas" when the URL brings a chosen statement. */
  protected readonly tab = linkedSignal<Tab>(() => (this.period() ? 'installments' : 'summary'));
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly today = inject(Today);

  protected readonly cardResource = httpResource<Card>(() => `${API}/cards/${this.id()}`);
  private readonly statementsResource = httpResource<StatementSummary[]>(
    () => `${API}/cards/${this.id()}/statements`,
  );
  private readonly openDetailResource = httpResource<StatementDetail>(() => {
    const open = this.card()?.openStatement;
    return open ? `${API}/statements/${open.id}` : undefined;
  });

  protected readonly card = computed(() => this.cardResource.value());
  protected readonly openDetail = computed(() => this.openDetailResource.value());
  private readonly statements = computed(() => this.statementsResource.value() ?? []);

  protected readonly toPay = computed(() =>
    this.statements().filter((s) => s.status === 'CLOSED' || s.status === 'PARTIALLY_PAID'),
  );
  protected readonly upcoming = computed(() => {
    const open = this.card()?.openStatement?.period;
    return this.statements().filter(
      (s) => open && compareDates(parsePeriod(s.period), parsePeriod(open)) > 0,
    );
  });

  protected readonly usedPercent = computed(() => {
    const card = this.card();
    if (!card?.creditLimit) return 0;
    const ratio = toDecimal(card.committedArs).dividedBy(card.creditLimit).times(100);
    return Math.min(100, Math.max(0, ratio.toDecimalPlaces(0).toNumber()));
  });

  /** The "Cuotas" tab (TAR-05, iteration 9): every statement with installments. */
  protected readonly summaryResource = httpResource<InstallmentStatement[]>(() =>
    this.tab() === 'installments' ? `${API}/cards/${this.id()}/statements/summary` : undefined,
  );
  protected readonly summary = computed(() => this.summaryResource.value() ?? []);
  protected readonly chartPage = CHART_PAGE;

  /** The statement chosen: the one in the URL if it is in the list, else the next to pay. */
  protected readonly selectedIndex = computed(() => {
    const list = this.summary();
    const fromUrl = list.findIndex((s) => s.period === this.period());
    return fromUrl >= 0 ? fromUrl : nextToPayIndex(list);
  });
  protected readonly selected = computed(() => this.summary()[this.selectedIndex()]);
  protected readonly selectedPeriod = computed(() => this.selected()?.period ?? null);
  /** First statement of the chart page; follows the chosen one until the arrows move it. */
  protected readonly pageStart = linkedSignal(() =>
    pageStartFor(this.selectedIndex(), this.summary().length),
  );

  protected readonly itemsResource = httpResource<StatementPlanInstallment[]>(() => {
    const period = this.selectedPeriod();
    return period ? `${API}/cards/${this.id()}/installments?period=${period}` : undefined;
  });
  protected readonly items = computed(() => this.itemsResource.value() ?? []);

  protected readonly bars = computed(() => {
    const page = this.summary().slice(this.pageStart(), this.pageStart() + CHART_PAGE);
    const max = page.reduce((m, s) => Math.max(m, Number.parseFloat(s.installmentsTotal.ARS)), 0);
    return page.map((s) => {
      const value = Number.parseFloat(s.installmentsTotal.ARS);
      const name = formatPeriod(parsePeriod(s.period));
      return {
        period: s.period,
        month: MONTHS_SHORT[Number(s.period.slice(5, 7)) - 1],
        short: value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)),
        label: this.texts.installmentsTab.bar(name, s.installmentsCount),
        amount: s.installmentsTotal.ARS,
        // Pixel heights for the chart only; amounts themselves stay decimal strings.
        height: max > 0 ? Math.max(6, Math.round((value / max) * 96)) : 6,
      };
    });
  });

  protected select(period: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { period },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected movePage(direction: -1 | 1): void {
    this.pageStart.set(
      clampStart(this.pageStart() + direction * CHART_PAGE, this.summary().length),
    );
  }

  /** "Diciembre", with the year when it is not this year's ("Enero 2027"). */
  protected monthName(period: string, lower = false): string {
    const name = MONTHS_LONG[Number(period.slice(5, 7)) - 1];
    const year = period.slice(0, 4);
    const text = year === this.today.period().slice(0, 4) ? name : `${name} ${year}`;
    return lower ? text.toLowerCase() : text;
  }

  protected nextMonthName(period: string): string {
    return this.monthName(addMonths(parsePeriod(period), 1), true);
  }

  protected hasArs(amounts: { ARS: string }): boolean {
    return Money.of(amounts.ARS, 'ARS').isPositive();
  }

  protected hasUsd(amounts: { USD: string }): boolean {
    return Money.of(amounts.USD, 'USD').isPositive();
  }

  protected readonly history = signal<StatementSummary[]>([]);
  /** Period of the last statement shown, while there may be more. */
  protected readonly historyCursor = signal<string | null>(null);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.loadHistory(true));
    });
    reloadOn(this.bus, ['cards'], () => {
      this.cardResource.reload();
      this.statementsResource.reload();
      this.summaryResource.reload();
      this.itemsResource.reload();
      this.openDetailResource.reload();
      void this.loadHistory(true);
    });
  }

  protected async loadHistory(reset: boolean): Promise<void> {
    this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const cursor = reset ? undefined : (this.historyCursor() ?? undefined);
      const page = await this.store.statementHistory(this.id(), cursor, HISTORY_PAGE);
      this.history.update((list) => (reset ? page : [...list, ...page]));
      this.historyCursor.set(page.length === HISTORY_PAGE ? page[page.length - 1].period : null);
    } catch {
      this.historyError.set(this.texts.history.loadError);
    } finally {
      this.historyLoading.set(false);
    }
  }

  protected openStatement(card: Card, statement: StatementSummary): void {
    this.sheet.open(StatementDetailSheet, {
      data: { card, statement } satisfies StatementDetailData,
      ariaLabel: this.texts.statement.title(this.periodLabel(statement.period)),
    });
  }

  protected periodLabel(period: string): string {
    return formatPeriod(parsePeriod(period));
  }

  protected dateText(date: string): string {
    return formatDate(parseLocalDate(date));
  }

  protected addCharge(card: Card): void {
    this.sheet.open(ChargeFormSheet, {
      data: { card } satisfies ChargeFormData,
      ariaLabel: this.texts.addChargeLabel,
    });
  }

  /** TAR-11: opens the charge behind an installment to edit or delete it. */
  protected async editCharge(card: Card, chargeId: string): Promise<void> {
    this.chargeError.set(null);
    try {
      const charge = await this.store.getCharge(chargeId);
      this.sheet.open(ChargeFormSheet, {
        data: { card, charge } satisfies ChargeFormData,
        ariaLabel: this.texts.charge.editTitle,
      });
    } catch {
      this.chargeError.set(this.texts.charge.loadError);
    }
  }

  protected edit(card: Card): void {
    this.sheet.open(CardFormSheet, { data: card, ariaLabel: this.texts.edit });
  }

  protected close(statement: StatementSummary): void {
    this.sheet.open(CloseStatementSheet, { data: statement, ariaLabel: this.texts.closeStatement });
  }

  protected pay(card: Card, statement: StatementSummary): void {
    this.sheet.open(PayStatementSheet, {
      data: { card, statement },
      ariaLabel: this.texts.payStatement,
    });
  }
}
