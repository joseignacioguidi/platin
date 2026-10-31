import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Card, StatementDetail, StatementSummary } from '@platin/contracts';
import { parseLocalDate, parsePeriod } from '@platin/domain';
import {
  formatDate,
  formatPeriod,
  PlBottomSheet,
  PlErrorState,
  PlListItem,
  PlMoney,
  PlSheet,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { ChargeFormData, ChargeFormSheet } from './charge-form-sheet';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

export interface StatementDetailData {
  card: Card;
  statement: StatementSummary;
}

/** TAR-12: a past statement with its charges, installments, adjustments and payments. */
@Component({
  selector: 'pl-statement-detail-sheet',
  imports: [PlSheet, PlMoney, PlListItem, PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="s.title(period)">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-tile bg-field p-4 text-[15px]">
        <div class="flex flex-col">
          <dt class="text-sm text-muted">{{ s.closing }}</dt>
          <dd class="font-amount">{{ date(statement.closingDate) }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-sm text-muted">{{ s.due }}</dt>
          <dd class="font-amount">{{ date(statement.dueDate) }}</dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-sm text-muted">{{ s.total }}</dt>
          <dd class="flex flex-col">
            <pl-money [amount]="statement.totals.ARS" />
            @if (statement.totals.USD !== '0.00') {
              <pl-money [amount]="statement.totals.USD" currency="USD" />
            }
          </dd>
        </div>
        <div class="flex flex-col">
          <dt class="text-sm text-muted">{{ t.status[statement.status] }}</dt>
          <dd class="flex flex-col">
            @if (statement.status === 'PAID') {
              <span>{{ s.paid }}</span>
            } @else {
              <span class="text-sm text-muted">{{ s.pending }}</span>
              <pl-money [amount]="statement.pending.ARS" />
              @if (statement.pending.USD !== '0.00') {
                <pl-money [amount]="statement.pending.USD" currency="USD" />
              }
            }
          </dd>
        </div>
      </dl>

      @if (resource.error() && !resource.hasValue()) {
        <pl-error-state (retry)="resource.reload()" />
      } @else if (!detail()) {
        <pl-skeleton [heights]="[64, 64, 64]" />
      } @else if (detail(); as d) {
        <section class="flex flex-col gap-1">
          <h3 class="text-[15px] font-semibold">{{ s.charges }}</h3>
          <ul>
            @for (item of d.installments; track item.id) {
              <li>
                <button
                  type="button"
                  class="-mx-2 w-[calc(100%+1rem)] rounded-2xl px-2 text-left hover:bg-field"
                  [attr.aria-label]="t.editChargeLabel(item.description)"
                  (click)="openCharge(item.chargeId)"
                >
                  <pl-list-item
                    [heading]="item.description"
                    [subtitle]="
                      item.count > 1
                        ? t.installmentOf(item.number, item.count)
                        : date(item.purchaseDate)
                    "
                    [icon]="item.category.icon"
                    tone="card"
                  >
                    <pl-money [amount]="item.amount" [currency]="item.currency" />
                  </pl-list-item>
                </button>
              </li>
            } @empty {
              <li class="py-3 text-sm text-muted">{{ s.noCharges }}</li>
            }
          </ul>
        </section>

        @if (d.adjustments.length > 0) {
          <section class="flex flex-col gap-1">
            <h3 class="text-[15px] font-semibold">{{ s.adjustments }}</h3>
            @for (adjustment of d.adjustments; track adjustment.id) {
              <pl-list-item
                [heading]="adjustment.description ?? t.adjustment"
                [subtitle]="adjustment.category.name"
                icon="percent"
                tone="muted"
              >
                <pl-money [amount]="adjustment.amount" [currency]="adjustment.currency" />
              </pl-list-item>
            }
          </section>
        }

        <section class="flex flex-col gap-1">
          <h3 class="text-[15px] font-semibold">{{ s.payments }}</h3>
          @for (payment of d.payments; track payment.id) {
            <pl-list-item
              [heading]="date(payment.date)"
              [subtitle]="s.paymentFrom(payment.pocketName, payment.accountName)"
              icon="arrow-left-right"
              tone="transfer"
            >
              <pl-money [amount]="payment.amountIn" [currency]="payment.currencyIn" />
            </pl-list-item>
          } @empty {
            <p class="py-3 text-sm text-muted">{{ s.noPayments }}</p>
          }
        </section>
      }
    </pl-sheet>
  `,
})
export class StatementDetailSheet {
  private readonly data = inject<StatementDetailData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly sheet = inject(PlBottomSheet);
  private readonly store = inject(CardsStore);
  protected readonly t = CARDS_TEXTS;
  protected readonly s = CARDS_TEXTS.statement;
  protected readonly statement = this.data.statement;
  protected readonly period = formatPeriod(parsePeriod(this.statement.period));

  protected readonly resource = httpResource<StatementDetail>(
    () => `${API}/statements/${this.statement.id}`,
  );
  protected readonly detail = computed(() => this.resource.value());

  protected date(value: string): string {
    return formatDate(parseLocalDate(value));
  }

  /** The purchase behind an installment: in a closed statement only its text can change. */
  protected async openCharge(chargeId: string): Promise<void> {
    const charge = await this.store.getCharge(chargeId);
    this.ref.close();
    this.sheet.open(ChargeFormSheet, {
      data: { card: this.data.card, charge } satisfies ChargeFormData,
      ariaLabel: this.t.charge.editTitle,
    });
  }
}
