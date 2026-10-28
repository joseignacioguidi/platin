import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Card, StatementSummary } from '@platin/contracts';
import { Currency, LocalDate } from '@platin/domain';
import {
  parseTypedAmount,
  PlButton,
  PlDateField,
  PlSegmented,
  PlSegmentOption,
  PlPocketSelect,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

export interface PayStatementData {
  card: Card;
  statement: StatementSummary;
}

/** TAR-08: pay the pesos or the dollars part (total or partial) from an account. */
@Component({
  selector: 'pl-pay-statement-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlPocketSelect, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.part }}</span>
        <pl-segmented
          [label]="t.part"
          [options]="parts"
          [value]="currency()"
          (valueChange)="setCurrency($event)"
        />
      </div>
      <pl-form-field [label]="t.account" controlId="pay-account">
        <pl-pocket-select
          inputId="pay-account"
          [label]="t.account"
          [pockets]="accounts.pockets()"
          display="account"
          [value]="accountId()"
          (valueChange)="accountId.set($event ?? '')"
        />
      </pl-form-field>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.amount }} ({{ currency() }})</span>
        <input
          type="text"
          inputmode="decimal"
          [class]="input + ' font-amount'"
          [value]="amount()"
          (input)="amount.set(value($event))"
        />
      </label>
      @if (crossCurrency()) {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.amountOut }} ({{ account()?.currency }})</span>
          <input
            type="text"
            inputmode="decimal"
            [class]="input + ' font-amount'"
            [value]="amountOut()"
            (input)="amountOut.set(value($event))"
          />
          <span class="text-xs text-muted">{{ t.amountOutHint }}</span>
        </label>
      }
      <pl-form-field [label]="t.date" controlId="pay-date">
        <pl-date-field
          inputId="pay-date"
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
        {{ t.save }}
      </button>
    </pl-sheet>
  `,
})
export class PayStatementSheet {
  protected readonly t = CARDS_TEXTS.pay;
  protected readonly input = INPUT_CLASS;
  protected readonly data = inject<PayStatementData>(DIALOG_DATA);
  protected readonly accounts = inject(AccountsStore);
  protected readonly today = inject(Today);
  private readonly store = inject(CardsStore);
  private readonly ref = inject(DialogRef);

  protected readonly parts: PlSegmentOption<Currency>[] = [
    { value: 'ARS', label: 'Pesos' },
    { value: 'USD', label: 'Dólares' },
  ];
  protected readonly currency = signal<Currency>(
    this.data.statement.pending.ARS !== '0.00' || this.data.statement.pending.USD === '0.00'
      ? 'ARS'
      : 'USD',
  );
  protected readonly amount = signal(this.pendingText(this.currency()));
  protected readonly amountOut = signal('');
  protected readonly accountId = signal(
    this.data.card.defaultPaymentPocketId ?? this.firstAvailable() ?? '',
  );
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly account = computed(() => this.accounts.pocketById(this.accountId()));
  protected readonly crossCurrency = computed(
    () => !!this.account() && this.account()?.currency !== this.currency(),
  );

  /** The first "Disponible" in the currency of the part being paid, or any available one. */
  private firstAvailable(): string | undefined {
    const available = this.accounts.pockets().filter((p) => p.kind === 'AVAILABLE');
    return (available.find((p) => p.currency === this.currency()) ?? available[0])?.id;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setCurrency(currency: Currency): void {
    this.currency.set(currency);
    this.amount.set(this.pendingText(currency));
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected async save(): Promise<void> {
    const amount = parseTypedAmount(this.amount());
    if (!amount) return this.error.set('Ingresá el monto a pagar.');
    const amountOut = this.crossCurrency() ? parseTypedAmount(this.amountOut()) : undefined;
    if (this.crossCurrency() && !amountOut)
      return this.error.set('Ingresá cuánto sale del apartado.');
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.pay(this.data.statement.id, {
        pocketId: this.accountId(),
        currency: this.currency(),
        amount,
        amountOut,
        date: this.date(),
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private pendingText(currency: Currency): string {
    return this.data.statement.pending[currency].replace(/\.00$/, '').replace('.', ',');
  }
}
