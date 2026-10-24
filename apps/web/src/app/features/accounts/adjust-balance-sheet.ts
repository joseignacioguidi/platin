import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Account } from '@platin/contracts';
import { LocalDate, parseLocalDate } from '@platin/domain';
import { parseTypedAmount, PlButton, PlMoney, PlSheet } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

/** CTA-04: type the real balance; the difference is recorded as an adjustment. */
@Component({
  selector: 'pl-adjust-balance-sheet',
  imports: [PlSheet, PlButton, PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="texts.title">
      <p class="text-[15px] text-muted">{{ texts.body }}</p>
      <p class="text-sm">
        {{ detail.balance }}:
        <pl-money [amount]="account.balance" [currency]="account.currency" decimals="auto" />
      </p>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ texts.real }} ({{ account.currency }})</span>
        <input
          type="text"
          inputmode="decimal"
          [class]="inputClass + ' font-amount'"
          [value]="real()"
          (input)="real.set(value($event))"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ texts.date }}</span>
        <input
          type="date"
          [class]="inputClass"
          [value]="date()"
          [max]="today.date()"
          (change)="setDate($event)"
        />
      </label>
      @if (needsRate()) {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ texts.rate }}</span>
          <input
            type="text"
            inputmode="decimal"
            [class]="inputClass + ' font-amount'"
            [value]="rate()"
            (input)="rate.set(value($event))"
          />
        </label>
      }
      @if (message()) {
        <p class="rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ texts.save }}
      </button>
    </pl-sheet>
  `,
})
export class AdjustBalanceSheet {
  protected readonly texts = ACCOUNTS_TEXTS.adjust;
  protected readonly detail = ACCOUNTS_TEXTS.detail;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly account = inject<Account>(DIALOG_DATA);
  protected readonly today = inject(Today);
  private readonly ref = inject(DialogRef);
  private readonly store = inject(AccountsStore);
  private readonly auth = inject(AuthService);

  protected readonly real = signal('');
  protected readonly rate = signal('');
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly needsRate = computed(
    () => this.account.currency !== (this.auth.user()?.baseCurrency ?? 'ARS'),
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(event: Event): void {
    const value = this.value(event);
    if (value) this.date.set(parseLocalDate(value));
  }

  protected async save(): Promise<void> {
    const typed = this.real().trim();
    const negative = typed.startsWith('-');
    const parsed = parseTypedAmount(negative ? typed.slice(1) : typed);
    if (parsed === undefined) {
      this.error.set('Ingresá el saldo real.');
      return;
    }
    const exchangeRate = this.needsRate() ? parseTypedAmount(this.rate()) : undefined;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.store.adjust(this.account.id, {
        balance: negative ? `-${parsed}` : parsed,
        date: this.date(),
        exchangeRate,
      });
      if (result.adjustment) this.ref.close(true);
      else this.message.set(this.texts.same);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
