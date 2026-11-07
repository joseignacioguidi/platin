import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { httpResource } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideChevronDown, LucideChevronRight } from '@lucide/angular';
import type { MonthGroup, MonthSummary, Movement } from '@platin/contracts';
import { parseLocalDate, parsePeriod, Period, toDecimal } from '@platin/domain';
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
import { HomeToPay, ToPayData } from './home-to-pay';

export interface MonthSummaryData {
  period: Period;
  /** "Para pagar" leads to its list. */
  toPay: ToPayData;
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
 * DAS-05, the month summary ("Libre"): where the money came from and where it went. Groups by
 * category, card statement and reserve open to show their movements; a movement opens its edit
 * sheet. Requested when it opens.
 */
@Component({
  selector: 'pl-month-summary-sheet',
  imports: [
    NgTemplateOutlet,
    PlSheet,
    PlMoney,
    PlSkeleton,
    PlErrorState,
    MovementRow,
    LucideChevronDown,
    LucideChevronRight,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="heading">
      @if (resource.hasValue()) {
        @let s = resource.value();
        <section class="flex flex-col" [attr.aria-label]="texts.summaryHad">
          <h3 class="pb-1 text-[13px] font-semibold text-muted uppercase">
            {{ texts.summaryHad }}
          </h3>
          @if (!isZero(s.opening)) {
            <ng-container
              *ngTemplateOutlet="line; context: { label: texts.opening, amount: s.opening }"
            />
          }
          @for (group of income(); track group.key) {
            <ng-container *ngTemplateOutlet="groupRow; context: { $implicit: group }" />
          }
          @if (!isZero(s.toCollect)) {
            <ng-container
              *ngTemplateOutlet="line; context: { label: texts.toCollect, amount: s.toCollect }"
            />
          }
          @if (positive(s.other)) {
            <ng-container
              *ngTemplateOutlet="line; context: { label: texts.other, amount: s.other }"
            />
          }
        </section>

        <section class="mt-4 flex flex-col" [attr.aria-label]="texts.summaryWent">
          <h3 class="pb-1 text-[13px] font-semibold text-muted uppercase">
            {{ texts.summaryWent }}
          </h3>
          @for (group of went(); track group.key) {
            <ng-container *ngTemplateOutlet="groupRow; context: { $implicit: group }" />
          }
          @if (!isZero(s.toPay)) {
            <div class="border-b border-line-soft">
              <button
                type="button"
                class="flex min-h-12 w-full items-center gap-3 text-left"
                (click)="openToPay()"
              >
                <span class="min-w-0 flex-1 text-[15px]">{{ texts.toPayMonth }}</span>
                <pl-money class="text-[15px]" [amount]="s.toPay" [currency]="s.currency" />
                <svg
                  lucideChevronRight
                  class="shrink-0 text-muted"
                  [size]="18"
                  aria-hidden="true"
                ></svg>
              </button>
            </div>
          }
          @if (s.other.startsWith('-')) {
            <ng-container
              *ngTemplateOutlet="line; context: { label: texts.other, amount: s.other }"
            />
          }
        </section>

        <div class="mt-2 flex min-h-12 items-center gap-3">
          <span class="min-w-0 flex-1 text-base font-bold">{{ texts.leftOver }}</span>
          <pl-money class="mr-7 text-base font-bold" [amount]="s.free" [currency]="s.currency" />
        </div>

        <ng-template #line let-label="label" let-amount="amount">
          <div class="flex min-h-12 items-center gap-3 border-b border-line-soft">
            <span class="min-w-0 flex-1 text-[15px]">{{ label }}</span>
            <pl-money class="mr-7 text-[15px]" [amount]="amount" [currency]="s.currency" />
          </div>
        </ng-template>

        <ng-template #groupRow let-group>
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
        </ng-template>
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
  private readonly data = inject<MonthSummaryData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly sheet = inject(PlBottomSheet);

  /** "Resumen de noviembre". */
  protected readonly heading = this.texts.summaryTitle(
    formatPeriod(parsePeriod(this.data.period)).split(' ')[0].toLowerCase(),
  );

  protected readonly resource = httpResource<MonthSummary>(() => ({
    url: `${API}/dashboard/summary`,
    params: { period: this.data.period },
  }));
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly income = computed(() =>
    (this.resource.value()?.income ?? []).map((g) => this.view(g, 'category')),
  );

  /** Paid by category, then the card statements, then the reserves. */
  protected readonly went = computed(() => {
    const s = this.resource.value();
    if (!s) return [];
    return [
      ...s.paidByCategory.map((g) => this.view(g, 'category')),
      ...s.paidByCard.map((g) => this.view(g, 'card')),
      ...s.reservedByPocket.map((g) => this.view(g, 'reserve')),
    ];
  });

  protected isZero(amount: string): boolean {
    return toDecimal(amount).isZero();
  }

  protected positive(amount: string): boolean {
    const value = toDecimal(amount);
    return value.isPositive() && !value.isZero();
  }

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

  protected openToPay(): void {
    this.ref.close();
    this.sheet.open(HomeToPay, { data: this.data.toPay, ariaLabel: this.texts.toPayTitle });
  }
}
