import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideChevronRight } from '@lucide/angular';
import type { MonthIncome, Movement, ToPayItem } from '@platin/contracts';
import { Period } from '@platin/domain';
import { PlBottomSheet, PlErrorState, PlMoney, PlSheet, PlSkeleton } from '@platin/web-ui';
import { API } from '../../core/api';
import { MovementRow } from '../transactions/movement-row';
import { MovementSheet } from '../transactions/movement-sheet';
import { TRANSACTIONS_TEXTS } from '../transactions/transactions.texts';
import { DASHBOARD_TEXTS } from './dashboard.texts';
import { openToPayItem, payDay, payPlace } from './home-to-pay';

export interface IncomeSheetData {
  period: Period;
}

/**
 * DAS-05, "Ingresos del mes": what was collected and what is still to collect, with date,
 * account and amount. Requested when it opens; a movement opens its edit sheet.
 */
@Component({
  selector: 'pl-income-sheet',
  imports: [PlSheet, PlMoney, PlSkeleton, PlErrorState, MovementRow, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="texts.incomeTitle">
      @if (resource.hasValue()) {
        @let income = resource.value();
        <section class="flex flex-col gap-1" [attr.aria-label]="texts.collected">
          <h3 class="flex items-baseline justify-between gap-3 text-[15px] font-bold">
            {{ texts.collected }}
            <pl-money [amount]="income.received" [currency]="income.currency" />
          </h3>
          @if (income.collected.length > 0) {
            <ul class="flex flex-col">
              @for (movement of income.collected; track movement.id) {
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
          } @else {
            <p class="py-3 text-sm text-muted">{{ texts.noCollected }}</p>
          }
        </section>

        @if (income.pending.length > 0) {
          <section class="mt-4 flex flex-col gap-1" [attr.aria-label]="texts.toCollect">
            <h3 class="flex items-baseline justify-between gap-3 text-[15px] font-bold">
              {{ texts.toCollect }}
              <pl-money [amount]="income.toCollect" [currency]="income.currency" />
            </h3>
            <ul class="flex flex-col">
              @for (item of income.pending; track item.type + item.id) {
                <li class="border-b border-line-soft last:border-b-0">
                  <button
                    type="button"
                    class="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                    (click)="openPending(item)"
                  >
                    <span class="font-amount w-14 shrink-0 text-[13px] text-muted">{{
                      day(item.date)
                    }}</span>
                    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span class="truncate text-[15px] font-semibold">{{ title(item) }}</span>
                      <span class="truncate text-[13px] text-muted">{{
                        item.payFrom ? place(item.payFrom) : texts.noAccount
                      }}</span>
                    </span>
                    <pl-money
                      class="text-[15px]"
                      [amount]="item.amount"
                      [currency]="item.currency"
                    />
                    <svg
                      lucideChevronRight
                      class="shrink-0 text-muted"
                      [size]="18"
                      aria-hidden="true"
                    ></svg>
                  </button>
                </li>
              }
            </ul>
          </section>
        }
      } @else if (resource.error()) {
        <pl-error-state (retry)="resource.reload()" />
      } @else {
        <pl-skeleton [heights]="[56, 56, 56]" />
      }
    </pl-sheet>
  `,
})
export class IncomeSheet {
  protected readonly texts = DASHBOARD_TEXTS;
  private readonly data = inject<IncomeSheetData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly sheet = inject(PlBottomSheet);

  protected readonly resource = httpResource<MonthIncome>(() => ({
    url: `${API}/dashboard/income`,
    params: { period: this.data.period },
  }));

  protected readonly day = payDay;
  protected readonly place = payPlace;
  protected title(item: ToPayItem): string {
    return item.type === 'FIXED' ? this.texts.fixedIncome(item.name) : item.name;
  }

  protected edit(movement: Movement): void {
    this.ref.close();
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: TRANSACTIONS_TEXTS.title });
  }

  protected openPending(item: ToPayItem): void {
    this.ref.close();
    void openToPayItem(item, this.router, this.http, this.sheet);
  }
}
