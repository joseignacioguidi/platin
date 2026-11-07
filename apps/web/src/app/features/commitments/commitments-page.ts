import { httpResource } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronDown, LucideChevronRight } from '@lucide/angular';
import type { CommitmentsResponse, MonthCommitments, PayFrom } from '@platin/contracts';
import { parseLocalDate, parsePeriod } from '@platin/domain';
import {
  dateBadge,
  formatPeriod,
  PlEmptyState,
  PlMoney,
  PlErrorState,
  PlSkeleton,
  PlBottomSheet,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { PendingCount } from '../../layout/pending-count';
import { CardFormData, CardFormSheet } from '../cards/card-form-sheet';
import { CardsStore } from '../cards/cards.store';
import { CARDS_TEXTS } from '../cards/cards.texts';
import { FixedFormPreset, FixedFormSheet } from '../fixed/fixed-form-sheet';
import { FixedStore } from '../fixed/fixed.store';
import { COMMITMENTS_TEXTS } from './commitments.texts';

/** Months in the desktop list before "Ver hasta…". */
const FIRST_MONTHS = 8;

/**
 * Compromisos › Próximos meses (COM-01 to 05): what is already committed in each of the next 12
 * months, by currency, and where each line is paid from. On a phone each month unfolds; from
 * `lg`, the list of months on the left and the chosen one on the right.
 */
@Component({
  selector: 'pl-commitments-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    PlMoney,
    PlEmptyState,
    LucideChevronDown,
    LucideChevronRight,
    NgTemplateOutlet,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (pending.label(); as count) {
      <a
        routerLink="/app/compromisos/para-confirmar"
        class="flex min-h-13 items-center gap-2.5 rounded-2xl bg-pending-soft px-4 py-3 font-semibold text-pending-ink"
      >
        <span class="flex-1">{{ texts.pendingNotice(count) }}</span>
        <span>{{ texts.review }}</span>
        <svg lucideChevronRight [size]="18" aria-hidden="true"></svg>
      </a>
    }
    @if (data()?.rate === null && hasUsd()) {
      <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink">
        {{ texts.noRate }}
      </p>
    }

    @if (resource.error() && !resource.hasValue()) {
      <pl-error-state (retry)="resource.reload()" />
    } @else if (!resource.hasValue()) {
      <pl-skeleton [heights]="[72, 72, 72, 72]" />
    } @else if (empty()) {
      <pl-empty-state
        icon="calendar"
        [heading]="texts.emptyTitle"
        [description]="texts.emptyBody"
      />
    } @else {
      <!-- Phone and tablet: each month unfolds. -->
      <ul class="flex flex-col gap-2 lg:hidden">
        @for (month of months(); track month.period) {
          <li class="rounded-tile bg-surface">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-tile p-4 text-left"
              [attr.aria-expanded]="open() === month.period"
              (click)="toggle(month.period)"
            >
              <ng-container *ngTemplateOutlet="monthSummary; context: { $implicit: month }" />
              <svg
                lucideChevronDown
                [size]="18"
                class="text-muted transition-transform"
                [class.rotate-180]="open() === month.period"
              ></svg>
            </button>
            @if (open() === month.period) {
              <div class="flex flex-col gap-1 border-t border-line-soft px-4 py-3">
                <div class="flex justify-between text-sm text-muted">
                  <span>{{ texts.expectedIncome }}</span>
                  <pl-money [amount]="month.expectedIncome.base" [currency]="currency()" />
                </div>
                <ng-container *ngTemplateOutlet="noIncome" />
                <ng-container *ngTemplateOutlet="monthItems; context: { $implicit: month }" />
              </div>
            }
          </li>
        }
      </ul>

      <!-- Desktop: the months on the left, the chosen one on the right. -->
      <div class="hidden flex-wrap items-start gap-5 lg:flex">
        <section
          class="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5 rounded-card bg-surface p-3"
          aria-labelledby="months-title"
        >
          <h2 id="months-title" class="mx-3.5 mt-1 mb-2 font-bold">{{ texts.months }}</h2>
          @for (month of listedMonths(); track month.period) {
            <button
              type="button"
              class="flex min-h-16 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left"
              [class]="month.period === selected()?.period ? 'bg-brand-soft' : 'hover:bg-field'"
              [attr.aria-pressed]="month.period === selected()?.period"
              (click)="chosen.set(month.period)"
            >
              <ng-container *ngTemplateOutlet="monthSummary; context: { $implicit: month }" />
            </button>
          }
          @if (hiddenMonths() > 0) {
            <button
              type="button"
              class="flex min-h-11 items-center px-3.5 text-left text-sm font-semibold text-brand-strong"
              (click)="showAll.set(true)"
            >
              {{ texts.showUntil(lastMonthLabel()) }}
            </button>
          }
        </section>

        @if (selected(); as month) {
          <section
            class="flex min-w-0 flex-[2_1_480px] flex-col gap-4 rounded-card bg-surface px-6 py-5"
            aria-labelledby="month-detail-title"
          >
            <h2 id="month-detail-title" class="text-xl font-bold">
              {{ periodLabel(month.period) }}
            </h2>
            <dl class="grid grid-cols-3 gap-2">
              <div class="flex flex-col gap-0.5 rounded-2xl bg-field px-4 py-3">
                <dt class="text-[13px] text-muted">{{ texts.expectedIncome }}</dt>
                <dd>
                  <pl-money
                    class="text-xl font-bold"
                    [amount]="month.expectedIncome.base"
                    [currency]="currency()"
                  />
                </dd>
              </div>
              <div class="flex flex-col gap-0.5 rounded-2xl bg-field px-4 py-3">
                <dt class="text-[13px] text-muted">{{ texts.committed }}</dt>
                <dd class="flex flex-col">
                  @for (
                    line of month.committed.byCurrency;
                    track line.currency;
                    let first = $first
                  ) {
                    <pl-money
                      [class]="first ? 'text-xl font-bold' : 'text-sm'"
                      [amount]="line.amount"
                      [currency]="line.currency"
                    />
                  } @empty {
                    <pl-money class="text-xl font-bold" amount="0" [currency]="currency()" />
                  }
                </dd>
              </div>
              <div class="flex flex-col gap-0.5 rounded-2xl bg-field px-4 py-3">
                <dt class="text-[13px] text-muted">{{ texts.margin }}</dt>
                <dd>
                  <pl-money
                    class="text-xl font-bold"
                    [amount]="month.margin"
                    [currency]="currency()"
                    [tone]="isNegative(month.margin) ? 'none' : 'income'"
                  />
                </dd>
              </div>
            </dl>
            <ng-container *ngTemplateOutlet="noIncome" />
            <div class="flex flex-col">
              <ng-container *ngTemplateOutlet="monthItems; context: { $implicit: month }" />
            </div>
          </section>
        }
      </div>
    }

    <ng-template #monthSummary let-month>
      <div class="flex flex-1 flex-col gap-0.5">
        <span class="font-semibold">{{ periodLabel(month.period) }}</span>
        <span class="text-sm text-muted">
          {{ texts.margin }}
          <pl-money
            [amount]="month.margin"
            [currency]="currency()"
            [tone]="isNegative(month.margin) ? 'none' : 'income'"
          />
        </span>
      </div>
      <span class="font-amount flex flex-col items-end">
        @for (line of committedOf(month); track line.currency; let first = $first) {
          <pl-money
            [class]="first ? 'text-[17px]' : 'text-sm'"
            [amount]="line.amount"
            [currency]="line.currency"
          />
        } @empty {
          <pl-money class="text-[17px]" amount="0" [currency]="currency()" />
        }
      </span>
    </ng-template>

    <!-- COM-05: without fixed incomes, the margin doesn't count the salary. -->
    <ng-template #noIncome>
      @if (noFixedIncome()) {
        <p class="text-sm text-muted">
          {{ texts.noFixedIncome }}
          <button
            type="button"
            class="-my-3 inline-flex min-h-11 items-center font-semibold text-brand-strong"
            (click)="newFixedIncome()"
          >
            {{ texts.addFixedIncome }}
          </button>
        </p>
      }
    </ng-template>

    <ng-template #monthItems let-month>
      @for (item of itemsOf(month); track $index) {
        <!-- COM-04: no icon; where it is paid from, under the description. -->
        <div class="flex flex-col gap-2 border-line-soft py-1.5 lg:border-t lg:py-2.5">
          <div class="flex items-start justify-between gap-3">
            <span class="font-amount w-12 shrink-0 pt-1 text-xs text-muted uppercase">{{
              day(item.date)
            }}</span>
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-[15px] lg:font-semibold">
                @switch (item.type) {
                  @case ('STATEMENT') {
                    {{ texts.statement(item.cardName) }}
                    @if (item.partiallyPaid) {
                      <span class="font-normal text-muted">· {{ texts.partiallyPaid }}</span>
                    }
                  }
                  @case ('FIXED') {
                    {{ item.name }}
                    <span class="font-normal text-muted"
                      >· {{ item.cardName ? texts.fixedOn(item.cardName) : texts.fixed }}</span
                    >
                  }
                  @case ('SCHEDULED') {
                    {{ item.description }}
                    <span class="font-normal text-muted">· {{ texts.scheduled }}</span>
                  }
                }
              </span>
              @if (item.payFrom; as from) {
                <span class="truncate text-[13px] text-muted">{{
                  texts.payFrom(place(from))
                }}</span>
              } @else if (item.type !== 'SCHEDULED' && item.cardId) {
                <button
                  type="button"
                  class="-my-2.5 flex min-h-11 items-center gap-1 self-start text-[13px]"
                  [attr.aria-label]="texts.assignLabel(item.cardName ?? '')"
                  (click)="assignAccount(item.cardId)"
                >
                  <span class="text-muted">{{ texts.noAccount }}</span>
                  <span class="font-medium text-brand-strong">· {{ texts.assign }}</span>
                </button>
              }
            </div>
            <pl-money
              class="text-[15px] lg:font-semibold"
              [amount]="item.amount"
              [currency]="item.currency"
            />
          </div>
          @if (item.type === 'STATEMENT' && item.installments.length > 0) {
            <ul
              class="mb-1 ml-15 flex flex-col gap-1 text-[13px] text-muted lg:rounded-xl lg:bg-field lg:px-3 lg:pt-1 lg:pb-2"
            >
              @for (installment of item.installments; track $index) {
                <li class="flex justify-between gap-3">
                  <span class="truncate">
                    {{ installment.description }}
                    @if (installment.count > 1) {
                      · {{ installment.number }}/{{ installment.count }}
                    }
                  </span>
                  <pl-money [amount]="installment.amount" [currency]="item.currency" />
                </li>
              }
            </ul>
          }
        </div>
      } @empty {
        <p class="py-2 text-sm text-muted">{{ texts.nothing }}</p>
      }
    </ng-template>
  `,
})
export class CommitmentsPage {
  protected readonly texts = COMMITMENTS_TEXTS;
  private readonly bus = inject(RefreshBus);
  private readonly cards = inject(CardsStore);
  private readonly fixed = inject(FixedStore);
  private readonly sheet = inject(PlBottomSheet);
  protected readonly pending = inject(PendingCount);

  protected readonly resource = httpResource<CommitmentsResponse>(
    () => `${API}/commitments?months=12`,
  );
  protected readonly data = computed(() => this.resource.value());
  protected readonly months = computed<MonthCommitments[]>(() => this.data()?.months ?? []);
  protected readonly currency = computed(() => this.data()?.baseCurrency ?? 'ARS');
  /** Something in a currency other than the base: without rates it isn't valued. */
  protected readonly hasUsd = computed(() =>
    this.months().some((m) => m.committed.byCurrency.some((l) => l.currency !== this.currency())),
  );
  protected readonly empty = computed(() => this.months().every((m) => m.items.length === 0));
  /** Phone: the unfolded month. */
  protected readonly open = signal<string | null>(null);

  /** Desktop: the chosen month, the first one until another is chosen. */
  protected readonly chosen = signal<string | null>(null);
  protected readonly selected = computed<MonthCommitments | null>(
    () => this.months().find((m) => m.period === this.chosen()) ?? this.months()[0] ?? null,
  );
  protected readonly showAll = signal(false);
  protected readonly listedMonths = computed(() =>
    this.showAll() ? this.months() : this.months().slice(0, FIRST_MONTHS),
  );
  protected readonly hiddenMonths = computed(
    () => this.months().length - this.listedMonths().length,
  );
  protected readonly lastMonthLabel = computed(() => {
    const last = this.months().at(-1);
    return last ? this.periodLabel(last.period).toLowerCase() : '';
  });

  /** COM-05: no active fixed income, so the expected income leaves out the salary. */
  protected readonly noFixedIncome = computed(
    () =>
      this.fixed.resource.hasValue() &&
      !this.fixed.items().some((item) => item.kind === 'INCOME' && !item.paused && item.next),
  );

  constructor() {
    reloadOn(this.bus, ['commitments'], () => this.resource.reload());
  }

  /** Typed accessors for the templates (ng-template contexts are untyped). */
  protected committedOf(month: MonthCommitments): MonthCommitments['committed']['byCurrency'] {
    return month.committed.byCurrency;
  }

  protected itemsOf(month: MonthCommitments): MonthCommitments['items'] {
    return month.items;
  }

  /** "Mercado Pago" for its balance, "Mercado Pago · Cuotas" for a spending reserve. */
  protected place(from: PayFrom): string {
    return from.pocketName === 'Disponible'
      ? from.accountName
      : `${from.accountName} · ${from.pocketName}`;
  }

  /** "Sin cuenta asignada": the card opens on its payment account field. */
  protected assignAccount(cardId: string): void {
    const card = this.cards.byId(cardId);
    if (card) {
      this.sheet.open(CardFormSheet, {
        data: { card, focus: 'payment' } satisfies CardFormData,
        ariaLabel: CARDS_TEXTS.edit,
      });
    }
  }

  protected newFixedIncome(): void {
    this.sheet.open(FixedFormSheet, {
      data: { kind: 'INCOME' } satisfies FixedFormPreset,
      ariaLabel: this.texts.newFixedIncome,
    });
  }

  protected toggle(period: string): void {
    this.open.update((current) => (current === period ? null : period));
  }

  protected periodLabel(period: string): string {
    return formatPeriod(parsePeriod(period));
  }

  protected day(date: string): string {
    const badge = dateBadge(parseLocalDate(date));
    return `${badge.day} ${badge.month}`;
  }

  protected isNegative(amount: string): boolean {
    return amount.startsWith('-');
  }
}
