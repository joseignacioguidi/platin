import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Card, StatementSummary } from '@platin/contracts';
import { Currency, LocalDate, parseLocalDate } from '@platin/domain';
import { parseTypedAmount, PlButton, PlSegmented, PlSegmentOption, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { INPUT_CLASS } from '../../core/forms/form-field';
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
  imports: [PlSheet, PlButton, PlSegmented],
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
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.account }}</span>
        <select [class]="input" [value]="accountId()" (change)="accountId.set(value($event))">
          @for (account of accounts.accounts(); track account.id) {
            <option [value]="account.id">{{ account.name }} · {{ account.currency }}</option>
          }
        </select>
      </label>
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
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.date }}</span>
        <input
          type="date"
          [class]="input"
          [value]="date()"
          [max]="today.date()"
          (change)="setDate($event)"
        />
      </label>
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
    this.data.card.defaultPaymentAccountId ?? this.accounts.accounts()[0]?.id ?? '',
  );
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly account = computed(() => this.accounts.byId(this.accountId()));
  protected readonly crossCurrency = computed(
    () => !!this.account() && this.account()?.currency !== this.currency(),
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setCurrency(currency: Currency): void {
    this.currency.set(currency);
    this.amount.set(this.pendingText(currency));
  }

  protected setDate(event: Event): void {
    const value = this.value(event);
    if (value) this.date.set(parseLocalDate(value));
  }

  protected async save(): Promise<void> {
    const amount = parseTypedAmount(this.amount());
    if (!amount) return this.error.set('Ingresá el monto a pagar.');
    const amountOut = this.crossCurrency() ? parseTypedAmount(this.amountOut()) : undefined;
    if (this.crossCurrency() && !amountOut)
      return this.error.set('Ingresá cuánto sale de la cuenta.');
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.pay(this.data.statement.id, {
        accountId: this.accountId(),
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
