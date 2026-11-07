import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideChevronRight } from '@lucide/angular';
import type { MovementsPage, PayFrom, ToPayItem } from '@platin/contracts';
import { Currency, parseLocalDate, periodOf } from '@platin/domain';
import { formatDayMonth, PlBottomSheet, PlMoney, PlSheet } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { MovementSheet } from '../transactions/movement-sheet';
import { TRANSACTIONS_TEXTS } from '../transactions/transactions.texts';
import { DASHBOARD_TEXTS } from './dashboard.texts';

/** "Mercado Pago" for its balance, "Mercado Pago · Cuotas" for a spending reserve. */
export function payPlace(from: PayFrom): string {
  return from.pocketName === 'Disponible'
    ? from.accountName
    : `${from.accountName} · ${from.pocketName}`;
}

/** "Resumen Visa", "Alquiler · fijo" or the scheduled movement's description. */
export function toPayTitle(item: ToPayItem): string {
  if (item.type === 'STATEMENT') return DASHBOARD_TEXTS.statement(item.name);
  if (item.type === 'FIXED') return DASHBOARD_TEXTS.fixedName(item.name);
  return item.name;
}

export const payDay = (date: string) => formatDayMonth(parseLocalDate(date));

/**
 * Opens what a line of "to pay" is: the card with its statements, the fixed items, or the
 * scheduled movement in its edit sheet.
 */
export async function openToPayItem(
  item: ToPayItem,
  router: Router,
  http: HttpClient,
  sheet: PlBottomSheet,
): Promise<void> {
  if (item.type === 'STATEMENT') {
    await router.navigate(['/app/tarjetas', item.cardId]);
    return;
  }
  if (item.type === 'FIXED') {
    await router.navigate(['/app/compromisos/fijos']);
    return;
  }
  // A scheduled movement is pending in its month: find it there and open its edit sheet.
  const page = await firstValueFrom(
    http.get<MovementsPage>(`${API}/movements`, {
      params: { period: periodOf(parseLocalDate(item.date)), status: 'PENDING', limit: 100 },
    }),
  );
  const movement = page.items.find((m) => m.id === item.id);
  if (movement) {
    sheet.open(MovementSheet, { data: movement, ariaLabel: TRANSACTIONS_TEXTS.title });
  } else {
    await router.navigate(['/app/movimientos']);
  }
}

export interface ToPayData {
  items: ToPayItem[];
  currency: Currency;
  total: string;
}

/** DAS-07: everything still to pay this month, with its payment account (COM-04). */
@Component({
  selector: 'pl-home-to-pay',
  imports: [PlSheet, PlMoney, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="texts.toPayTitle">
      <p class="-mt-2 text-sm text-muted">
        <pl-money class="text-ink" [amount]="data.total" [currency]="data.currency" />
      </p>
      @if (data.items.length > 0) {
        <ul class="flex flex-col">
          @for (item of data.items; track $index) {
            <li class="border-b border-line-soft last:border-b-0">
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                (click)="open(item)"
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
                <pl-money class="text-[15px]" [amount]="item.amount" [currency]="item.currency" />
                <svg lucideChevronRight class="shrink-0 text-muted" [size]="18"></svg>
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="py-4 text-center text-sm text-muted">{{ texts.toPayEmpty }}</p>
      }
    </pl-sheet>
  `,
})
export class HomeToPay {
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly data = inject<ToPayData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly sheet = inject(PlBottomSheet);

  protected readonly title = toPayTitle;
  protected readonly place = payPlace;
  protected readonly day = payDay;

  protected open(item: ToPayItem): void {
    this.ref.close();
    void openToPayItem(item, this.router, this.http, this.sheet);
  }
}
