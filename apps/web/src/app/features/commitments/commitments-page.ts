import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
import type { CommitmentsResponse, MonthCommitments } from '@platin/contracts';
import { parseLocalDate, parsePeriod } from '@platin/domain';
import { dateBadge, formatPeriod, PlEmptyState, PlMoney } from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { COMMITMENTS_TEXTS } from './commitments.texts';

/** COM-01/02: what is already committed in each of the next 12 months, by currency. */
@Component({
  selector: 'pl-commitments-page',
  imports: [PlMoney, PlEmptyState, LucideChevronDown],
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

    @if (months().length > 0 && empty()) {
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
                  {{ texts.free }}
                  <pl-money
                    [amount]="month.free"
                    [currency]="currency()"
                    [tone]="isNegative(month.free) ? 'none' : 'income'"
                  />
                </span>
              </div>
              <span class="font-amount flex flex-col items-end">
                <pl-money class="text-[17px]" [amount]="month.committed.ARS" />
                @if (month.committed.USD !== '0.00') {
                  <pl-money class="text-sm" [amount]="month.committed.USD" currency="USD" />
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
                  <div class="flex items-center justify-between gap-3 py-1.5">
                    <span class="font-amount w-12 shrink-0 text-xs text-muted">{{
                      day(item.date)
                    }}</span>
                    <span class="min-w-0 flex-1 truncate text-[15px]">
                      @if (item.type === 'INSTALLMENT') {
                        {{ item.description }} · {{ item.number }}/{{ item.count }}
                        <span class="text-muted">· {{ item.cardName }}</span>
                      } @else {
                        {{ item.name }} <span class="text-muted">· {{ texts.fixed }}</span>
                      }
                    </span>
                    <pl-money
                      class="text-[15px]"
                      [amount]="item.amount"
                      [currency]="item.currency"
                    />
                  </div>
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

  private readonly resource = httpResource<CommitmentsResponse>(
    () => `${API}/commitments?months=12`,
  );
  protected readonly data = computed(() => this.resource.value());
  protected readonly months = computed<MonthCommitments[]>(() => this.data()?.months ?? []);
  protected readonly currency = computed(() => this.data()?.baseCurrency ?? 'ARS');
  protected readonly hasUsd = computed(() => this.months().some((m) => m.committed.USD !== '0.00'));
  protected readonly empty = computed(() => this.months().every((m) => m.items.length === 0));
  protected readonly open = signal<string | null>(null);

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
