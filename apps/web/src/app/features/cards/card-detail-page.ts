import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft, LucidePencil, LucidePlus } from '@lucide/angular';
import type { ActiveInstallment, Card, StatementDetail, StatementSummary } from '@platin/contracts';
import {
  addMonths,
  compareDates,
  formatMoney,
  Money,
  parseLocalDate,
  parsePeriod,
  toDecimal,
} from '@platin/domain';
import {
  formatDate,
  formatPeriod,
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
import { CardFormSheet } from './card-form-sheet';
import { CardVisual } from './card-visual';
import { ChargeFormSheet } from './charge-form-sheet';
import { CARDS_TEXTS } from './cards.texts';
import { CloseStatementSheet } from './close-statement-sheet';
import { PayStatementSheet } from './pay-statement-sheet';

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

      @if (card.creditLimit) {
        <section class="flex flex-col gap-2" [attr.aria-label]="texts.available">
          <div class="flex justify-between text-[15px] text-muted">
            <span
              >{{ texts.available }} <pl-money class="text-ink" [amount]="card.available ?? '0'"
            /></span>
            <span>{{ texts.limit }} <pl-money [amount]="card.creditLimit" /></span>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            [attr.aria-valuenow]="usedPercent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="h-full rounded-full bg-ink" [style.width.%]="usedPercent()"></div>
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
              <pl-list-item
                [heading]="item.description"
                [subtitle]="
                  item.count > 1 ? texts.installmentOf(item.number, item.count) : item.category.name
                "
                [icon]="item.category.icon"
                tone="card"
              >
                <pl-money class="text-[17px]" [amount]="item.amount" [currency]="item.currency" />
              </pl-list-item>
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
          @if (card.openStatement; as open) {
            <button plButton="secondary" type="button" (click)="close(open)">
              {{ texts.closeStatement }}
            </button>
          }
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
          <section class="flex flex-col gap-4 rounded-tile bg-surface p-4">
            <div class="flex items-baseline justify-between gap-2">
              <h2 class="text-[17px] font-semibold">{{ texts.installmentsByStatement }}</h2>
              @if (releases(); as r) {
                <span class="text-sm font-semibold text-brand-strong">{{ r }}</span>
              }
            </div>
            <div class="flex h-36 items-end gap-2" role="img" [attr.aria-label]="chartLabel()">
              @for (bar of bars(); track bar.period; let first = $first) {
                <div class="flex flex-1 flex-col items-center justify-end gap-1">
                  <span class="font-amount text-xs">{{ bar.label }}</span>
                  <div
                    class="w-full rounded-xl"
                    [class.bg-card]="first"
                    [class.bg-card-muted]="!first"
                    [style.height.px]="bar.height"
                  ></div>
                  <span class="text-xs text-muted">{{ bar.month }}</span>
                </div>
              }
            </div>
          </section>
          <section class="rounded-tile bg-surface px-4">
            @for (plan of plans(); track plan.chargeId) {
              <div class="flex flex-col gap-2 border-b border-line-soft py-4 last:border-b-0">
                <div class="flex items-baseline justify-between gap-2">
                  <span class="truncate text-[17px] font-semibold">{{ plan.description }}</span>
                  <span class="font-amount whitespace-nowrap">
                    <pl-money [amount]="plan.installmentAmount" [currency]="plan.currency" /><span
                      class="text-sm text-muted"
                      >{{ texts.perMonth }}</span
                    >
                  </span>
                </div>
                <div
                  class="h-2 overflow-hidden rounded-full bg-card-soft"
                  role="progressbar"
                  [attr.aria-valuenow]="plan.current"
                  aria-valuemin="0"
                  [attr.aria-valuemax]="plan.count"
                >
                  <div
                    class="h-full rounded-full bg-card"
                    [style.width.%]="(plan.current / plan.count) * 100"
                  ></div>
                </div>
                <div class="flex justify-between text-sm text-muted">
                  <span class="font-amount"
                    >{{ plan.current }} {{ texts.of }} {{ plan.count }}</span
                  >
                  <span
                    >{{ texts.remaining }}
                    <pl-money [amount]="plan.remainingAmount" [currency]="plan.currency"
                  /></span>
                </div>
              </div>
            } @empty {
              <pl-empty-state icon="credit-card" [heading]="texts.noInstallments" />
            }
          </section>
        }
      }
    }
  `,
})
export class CardDetailPage {
  readonly id = input.required<string>();

  protected readonly texts = CARDS_TEXTS;
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);

  protected readonly tabs: PlSegmentOption<Tab>[] = [
    { value: 'summary', label: CARDS_TEXTS.tabs.summary },
    { value: 'upcoming', label: CARDS_TEXTS.tabs.upcoming },
    { value: 'installments', label: CARDS_TEXTS.tabs.installments },
  ];
  protected readonly tab = signal<Tab>('summary');

  protected readonly cardResource = httpResource<Card>(() => `${API}/cards/${this.id()}`);
  private readonly statementsResource = httpResource<StatementSummary[]>(
    () => `${API}/cards/${this.id()}/statements`,
  );
  private readonly plansResource = httpResource<ActiveInstallment[]>(
    () => `${API}/cards/${this.id()}/installments?active=true`,
  );
  private readonly openDetailResource = httpResource<StatementDetail>(() => {
    const open = this.card()?.openStatement;
    return open ? `${API}/statements/${open.id}` : undefined;
  });

  protected readonly card = computed(() => this.cardResource.value());
  protected readonly openDetail = computed(() => this.openDetailResource.value());
  protected readonly plans = computed(() => this.plansResource.value() ?? []);
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

  /** Next 6 statements (from the open one) for the "Cuotas por resumen" chart. */
  protected readonly bars = computed(() => {
    const open = this.card()?.openStatement?.period;
    const series = this.statements()
      .filter((s) => open && compareDates(parsePeriod(s.period), parsePeriod(open)) >= 0)
      .slice(0, 6);
    const max = series.reduce((m, s) => Math.max(m, Number.parseFloat(s.totals.ARS)), 0);
    return series.map((s) => {
      const value = Number.parseFloat(s.totals.ARS);
      return {
        period: s.period,
        month: MONTHS_SHORT[Number(s.period.slice(5, 7)) - 1],
        label: value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)),
        // Pixel heights for the chart only; amounts themselves stay decimal strings.
        height: max > 0 ? Math.max(6, Math.round((value / max) * 96)) : 6,
      };
    });
  });
  protected readonly chartLabel = computed(() =>
    this.bars()
      .map((b) => `${b.month}: ${b.label}`)
      .join(', '),
  );

  /** COM-03 preview: the first month a plan ends, and how much it frees. */
  protected readonly releases = computed(() => {
    const plans = this.plans().filter((p) => p.currency === 'ARS' && p.lastPeriod);
    if (plans.length === 0) return null;
    const first = plans.reduce(
      (min, p) => (p.lastPeriod < min ? p.lastPeriod : min),
      plans[0].lastPeriod,
    );
    const freed = Money.sum(
      plans.filter((p) => p.lastPeriod === first).map((p) => Money.of(p.installmentAmount, 'ARS')),
      'ARS',
    );
    const month = addMonths(parsePeriod(first), 1);
    const amount = formatMoney(freed, { decimals: 'auto' });
    return this.texts.releases(MONTHS_LONG[Number(month.slice(5, 7)) - 1], amount);
  });

  constructor() {
    reloadOn(this.bus, ['cards'], () => {
      this.cardResource.reload();
      this.statementsResource.reload();
      this.plansResource.reload();
      this.openDetailResource.reload();
    });
  }

  protected periodLabel(period: string): string {
    return formatPeriod(parsePeriod(period));
  }

  protected dateText(date: string): string {
    return formatDate(parseLocalDate(date));
  }

  protected addCharge(card: Card): void {
    this.sheet.open(ChargeFormSheet, { data: card, ariaLabel: this.texts.addChargeLabel });
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
