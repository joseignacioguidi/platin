import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
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
import { CardFormData, CardFormSheet } from '../cards/card-form-sheet';
import { CardsStore } from '../cards/cards.store';
import { CARDS_TEXTS } from '../cards/cards.texts';
import { COMMITMENTS_TEXTS } from './commitments.texts';

/**
 * COM-01/02/04: what is already committed in each of the next 12 months, by currency, and
 * where each line is paid from.
 */
@Component({
  selector: 'pl-commitments-page',
  imports: [PlSkeleton, PlErrorState, PlMoney, PlEmptyState, LucideChevronDown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <p class="text-[15px] text-muted">{{ texts.intro }}</p>
    </header>
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
      <ul class="flex flex-col gap-2">
        @for (month of months(); track month.period) {
          <li class="rounded-tile bg-surface">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-tile p-4 text-left"
              [attr.aria-expanded]="open() === month.period"
              (click)="toggle(month.period)"
            >
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
                @for (line of month.committed.byCurrency; track line.currency; let first = $first) {
                  <pl-money
                    [class]="first ? 'text-[17px]' : 'text-sm'"
                    [amount]="line.amount"
                    [currency]="line.currency"
                  />
                } @empty {
                  <pl-money class="text-[17px]" amount="0" [currency]="currency()" />
                }
              </span>
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
                @for (item of month.items; track $index) {
                  <!-- COM-04: no icon; where it is paid from, under the description. -->
                  <div class="flex items-start justify-between gap-3 py-1.5">
                    <span class="font-amount w-12 shrink-0 pt-1 text-xs text-muted">{{
                      day(item.date)
                    }}</span>
                    <div class="flex min-w-0 flex-1 flex-col">
                      <span class="truncate text-[15px]">
                        @switch (item.type) {
                          @case ('STATEMENT') {
                            {{ texts.statement(item.cardName) }}
                            @if (item.partiallyPaid) {
                              <span class="text-muted">· {{ texts.partiallyPaid }}</span>
                            }
                          }
                          @case ('FIXED') {
                            {{ item.name }}
                            <span class="text-muted"
                              >·
                              {{ item.cardName ? texts.fixedOn(item.cardName) : texts.fixed }}</span
                            >
                          }
                          @case ('SCHEDULED') {
                            {{ item.description }}
                            <span class="text-muted">· {{ texts.scheduled }}</span>
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
                      class="text-[15px]"
                      [amount]="item.amount"
                      [currency]="item.currency"
                    />
                  </div>
                  @if (item.type === 'STATEMENT') {
                    <ul class="mb-1 ml-15 flex flex-col gap-0.5 text-[13px] text-muted">
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
                } @empty {
                  <p class="py-2 text-sm text-muted">{{ texts.nothing }}</p>
                }
              </div>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class CommitmentsPage {
  protected readonly texts = COMMITMENTS_TEXTS;
  private readonly bus = inject(RefreshBus);
  private readonly cards = inject(CardsStore);
  private readonly sheet = inject(PlBottomSheet);

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
  protected readonly open = signal<string | null>(null);

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

  constructor() {
    reloadOn(this.bus, ['commitments'], () => this.resource.reload());
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
