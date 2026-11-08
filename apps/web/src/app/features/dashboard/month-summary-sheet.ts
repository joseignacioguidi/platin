import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';
import type { MonthGroup, MonthSummary, Movement } from '@platin/contracts';
import { parseLocalDate, parsePeriod, Period } from '@platin/domain';
import {
  formatDayMonth,
  formatPeriod,
  PlBottomSheet,
  PlErrorState,
  PlMoney,
  PlSheet,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { MovementRow } from '../transactions/movement-row';
import { MovementSheet } from '../transactions/movement-sheet';
import { TRANSACTIONS_TEXTS } from '../transactions/transactions.texts';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** What the sheet shows: what was paid ("Ya pagaste") or what was reserved ("Reservaste"). */
export type MonthSummaryView = 'paid' | 'reserved';

export interface MonthSummaryData {
  period: Period;
  view: MonthSummaryView;
}

/** A group as the sheet shows it. */
interface GroupView {
  key: string;
  name: string;
  detail: string | null;
  amount: string;
  movements: Movement[];
}

/**
 * DAS-05, the month in detail (ADR 0034): "Ya pagaste" opens where the money went, by category
 * and by card statement; "Reservaste" opens each reserve. Groups open to show their movements;
 * a movement opens its edit sheet. Requested when it opens.
 */
@Component({
  selector: 'pl-month-summary-sheet',
  imports: [PlSheet, PlMoney, PlSkeleton, PlErrorState, MovementRow, LucideChevronDown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="heading">
      @if (resource.hasValue()) {
        @let s = resource.value();
        <section class="flex flex-col" [attr.aria-label]="sectionTitle">
          @if (data.view === 'paid') {
            <h3 class="pb-1 text-[13px] font-semibold text-muted uppercase">
              {{ texts.summaryWent }}
            </h3>
          }
          @for (group of groups(); track group.key) {
            <div class="border-b border-line-soft">
              <button
                type="button"
                class="flex min-h-12 w-full items-center gap-3 py-1.5 text-left"
                [attr.aria-expanded]="expanded().has(group.key)"
                (click)="toggle(group.key)"
              >
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="truncate text-[15px]">{{ group.name }}</span>
                  @if (group.detail) {
                    <span class="truncate text-[13px] text-muted">{{ group.detail }}</span>
                  }
                </span>
                <pl-money class="text-[15px]" [amount]="group.amount" [currency]="s.currency" />
                <svg
                  lucideChevronDown
                  class="shrink-0 text-muted transition-transform"
                  [class.rotate-180]="expanded().has(group.key)"
                  [size]="18"
                  aria-hidden="true"
                ></svg>
              </button>
              @if (expanded().has(group.key)) {
                <ul class="mb-2 flex flex-col rounded-xl bg-field px-3">
                  @for (movement of group.movements; track movement.kind + movement.id) {
                    <li class="border-b border-line-soft last:border-b-0">
                      <button
                        type="button"
                        class="block w-full rounded-xl text-left"
                        (click)="edit(movement)"
                      >
                        <pl-movement-row [movement]="movement" [icons]="false" [dated]="true" />
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>
          } @empty {
            <p class="py-3 text-[15px] text-muted">
              {{ data.view === 'paid' ? texts.noPaid : texts.noReserved }}
            </p>
          }
        </section>
      } @else if (resource.error()) {
        <pl-error-state (retry)="resource.reload()" />
      } @else {
        <pl-skeleton [heights]="[48, 48, 48, 48, 48]" />
      }
    </pl-sheet>
  `,
})
export class MonthSummarySheet {
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly data = inject<MonthSummaryData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly sheet = inject(PlBottomSheet);

  private readonly month = formatPeriod(parsePeriod(this.data.period)).split(' ')[0].toLowerCase();
  /** "Ya pagaste en noviembre" or "Reservaste en noviembre". */
  protected readonly heading =
    this.data.view === 'paid'
      ? this.texts.paidTitle(this.month)
      : this.texts.reservedTitle(this.month);
  protected readonly sectionTitle =
    this.data.view === 'paid' ? this.texts.summaryWent : this.texts.reserved;

  protected readonly resource = httpResource<MonthSummary>(() => ({
    url: `${API}/dashboard/summary`,
    params: { period: this.data.period },
  }));
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** Paid by category, then the card statements; or the reserves. */
  protected readonly groups = computed(() => {
    const s = this.resource.value();
    if (!s) return [];
    if (this.data.view === 'reserved') {
      return s.reservedByPocket.map((g) => this.view(g, 'reserve'));
    }
    return [
      ...s.paidByCategory.map((g) => this.view(g, 'category')),
      ...s.paidByCard.map((g) => this.view(g, 'card')),
    ];
  });

  private view(group: MonthGroup, kind: 'category' | 'card' | 'reserve'): GroupView {
    const t = this.texts;
    const name =
      kind === 'card'
        ? t.cardStatement(group.name)
        : group.key === 'OTHER'
          ? t.otherCategories
          : group.key === 'NONE'
            ? t.noCategory
            : group.name;
    const detail = group.purchases
      ? t.purchases(
          formatDayMonth(parseLocalDate(group.purchases.from)),
          formatDayMonth(parseLocalDate(group.purchases.to)),
        )
      : null;
    return {
      key: `${kind}|${group.key}`,
      name,
      detail,
      amount: group.amount,
      movements: group.movements,
    };
  }

  protected toggle(key: string): void {
    this.expanded.update((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected edit(movement: Movement): void {
    this.ref.close();
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: TRANSACTIONS_TEXTS.title });
  }
}
