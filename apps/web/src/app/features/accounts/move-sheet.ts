import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Pocket } from '@platin/contracts';
import { impliedRate, LocalDate, Money } from '@platin/domain';
import {
  formatRate,
  parseTypedAmount,
  PlAccountSelect,
  PlButton,
  PlDateField,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { TransactionsStore } from '../transactions/transactions.store';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

export interface MoveSheetData {
  reserve: Pocket;
  /** IN: "Ingresar desde una cuenta"; OUT: "Retirar" to an account. */
  direction: 'IN' | 'OUT';
}

/**
 * CTA-05, 06: money gets into a reserve from the balance of an account, and back out to the
 * balance of an account (its own by default). Between currencies it asks for both amounts and
 * shows the resulting rate. The intent (set apart, invest, redeem) comes from the reserve's use.
 */
@Component({
  selector: 'pl-move-sheet',
  imports: [PlSheet, PlButton, PlAccountSelect, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.titles[data.direction](data.reserve.name)">
      @if (store.pockets().length === 0) {
        <p class="rounded-2xl bg-pending-soft px-4 py-3 text-[15px] text-pending-ink">
          {{ t.noAccount }}
        </p>
      } @else {
        <pl-account-select
          appearance="tile"
          [label]="data.direction === 'IN' ? t.from : t.to"
          [pockets]="store.pockets()"
          [value]="accountId()"
          (valueChange)="accountId.set($event)"
        />
        <pl-form-field
          [label]="t.amount + ' (' + (from()?.currency ?? 'ARS') + ')'"
          controlId="move-amount"
        >
          <input
            id="move-amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            [class]="input + ' font-amount text-2xl'"
            [value]="amount()"
            (input)="amount.set(value($event))"
            (keydown.enter)="save()"
          />
        </pl-form-field>
        @if (crossCurrency()) {
          <pl-form-field
            [label]="t.received + ' (' + to()?.currency + ')'"
            controlId="move-received"
          >
            <input
              id="move-received"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              [class]="input + ' font-amount'"
              [value]="received()"
              (input)="received.set(value($event))"
            />
          </pl-form-field>
          @if (rateLabel()) {
            <p class="font-amount text-sm text-muted" aria-live="polite">{{ rateLabel() }}</p>
          }
        }
        <pl-form-field [label]="t.date" controlId="move-date">
          <pl-date-field
            inputId="move-date"
            [label]="t.date"
            [max]="today.date()"
            [value]="date()"
            (valueChange)="setDate($event)"
          />
        </pl-form-field>
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
          {{ t.save[data.direction] }}
        </button>
      }
    </pl-sheet>
  `,
})
export class MoveSheet {
  protected readonly t = ACCOUNTS_TEXTS.move;
  protected readonly input = INPUT_CLASS;
  protected readonly data = inject<MoveSheetData>(DIALOG_DATA);
  protected readonly today = inject(Today);
  protected readonly store = inject(AccountsStore);
  private readonly transactions = inject(TransactionsStore);
  private readonly ref = inject(DialogRef);

  /** The reserve's own account balance in its currency, else in any currency, else any. */
  protected readonly accountId = signal<string | null>(this.ownAccount());
  protected readonly amount = signal('');
  protected readonly received = signal('');
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly account = computed(() => this.store.pocketById(this.accountId()));
  protected readonly from = computed(() =>
    this.data.direction === 'IN' ? this.account() : this.data.reserve,
  );
  protected readonly to = computed(() =>
    this.data.direction === 'IN' ? this.data.reserve : this.account(),
  );
  protected readonly crossCurrency = computed(
    () => !!this.from() && !!this.to() && this.from()?.currency !== this.to()?.currency,
  );
  protected readonly rateLabel = computed(() => {
    const from = this.from();
    const to = this.to();
    const out = parseTypedAmount(this.amount());
    const into = parseTypedAmount(this.received());
    if (!from || !to || !out || !into) return null;
    const rate = impliedRate(Money.of(out, from.currency), Money.of(into, to.currency));
    return rate ? this.t.rate(formatRate(from.currency, to.currency, rate)) : null;
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const errors = this.t.errors;
    const amount = parseTypedAmount(this.amount());
    if (!amount) return this.error.set(errors.amount);
    const from = this.from();
    const to = this.to();
    if (!from || !to) return this.error.set(errors.account);
    const amountIn = this.crossCurrency() ? parseTypedAmount(this.received()) : undefined;
    if (this.crossCurrency() && !amountIn) return this.error.set(errors.received);
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.transactions.transfer({
        fromPocketId: from.id,
        toPocketId: to.id,
        amountOut: amount,
        amountIn,
        date: this.date(),
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private ownAccount(): string | null {
    const balances = this.store.pockets().filter((p) => p.kind === 'AVAILABLE');
    const reserve = this.data.reserve;
    const own = balances.filter((p) => p.accountId === reserve.accountId);
    return (
      (
        own.find((p) => p.currency === reserve.currency) ??
        own[0] ??
        balances.find((p) => p.currency === reserve.currency) ??
        balances[0]
      )?.id ?? null
    );
  }
}
