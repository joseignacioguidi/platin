import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Pocket } from '@platin/contracts';
import { LocalDate, TransferIntent } from '@platin/domain';
import {
  parseTypedAmount,
  PlBottomSheet,
  PlButton,
  PlDateField,
  PlMoney,
  PlSheet,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { InvestmentsStore } from '../investments/investments.store';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';
import { MoveSheet, MoveSheetData } from './move-sheet';

/**
 * CTA-06: type the real balance; the difference is recorded as an adjustment. The sheet says
 * what it is for by pocket kind and offers shortcuts to the right action. An investment pocket
 * has no adjustment: it updates its value (INV-03, 04), and the difference becomes its yield.
 */
@Component({
  selector: 'pl-adjust-balance-sheet',
  imports: [PlSheet, PlButton, PlMoney, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="kind.title">
      <p class="text-[15px] text-muted">{{ kind.body }}</p>
      <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="texts.shortcutsLabel">
        @for (shortcut of kind.shortcuts; track shortcut) {
          <button plButton="secondary" type="button" (click)="openShortcut(shortcut)">
            {{ texts.shortcuts[shortcut] }}
          </button>
        }
      </div>
      <p class="text-sm">
        {{ valuation ? texts.currentValue : texts.current }}:
        <pl-money [amount]="pocket.balance" [currency]="pocket.currency" decimals="auto" />
      </p>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">
          {{ valuation ? texts.value : texts.real }} ({{ pocket.currency }})
        </span>
        <input
          type="text"
          inputmode="decimal"
          [class]="inputClass + ' font-amount'"
          [value]="real()"
          (input)="real.set(value($event))"
        />
      </label>
      <pl-form-field [label]="texts.date" controlId="adjust-date">
        <pl-date-field
          inputId="adjust-date"
          [label]="texts.date"
          [max]="today.date()"
          [value]="date()"
          (valueChange)="setDate($event)"
        />
      </pl-form-field>
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
        {{ valuation ? texts.saveValue : texts.save }}
      </button>
    </pl-sheet>
  `,
})
export class AdjustBalanceSheet {
  protected readonly texts = ACCOUNTS_TEXTS.adjust;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly pocket = inject<Pocket>(DIALOG_DATA);
  protected readonly kind = this.texts.kinds[this.pocket.kind];
  /** An investment pocket updates its value instead of adjusting its balance. */
  protected readonly valuation = this.pocket.kind === 'INVESTMENT';
  protected readonly today = inject(Today);
  private readonly ref = inject(DialogRef);
  private readonly store = inject(AccountsStore);
  private readonly investments = inject(InvestmentsStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly auth = inject(AuthService);

  protected readonly real = signal('');
  protected readonly rate = signal('');
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly needsRate = computed(
    () => !this.valuation && this.pocket.currency !== (this.auth.user()?.baseCurrency ?? 'ARS'),
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  /** "Mover", "Invertir" or "Rescatar" with this pocket already chosen. */
  protected openShortcut(intent: TransferIntent): void {
    const account = this.store.byId(this.pocket.accountId);
    if (!account) return;
    const data: MoveSheetData =
      intent === 'INVEST'
        ? { account, intent, toPocketId: this.pocket.id }
        : { account, intent, fromPocketId: this.pocket.id };
    this.ref.close();
    this.sheet.open(MoveSheet, { data, ariaLabel: ACCOUNTS_TEXTS.move.titles[intent] });
  }

  protected async save(): Promise<void> {
    if (this.valuation) return this.saveValuation();
    const typed = this.real().trim();
    const negative = typed.startsWith('-');
    const parsed = parseTypedAmount(negative ? typed.slice(1) : typed);
    if (parsed === undefined) {
      this.error.set(this.texts.errorBalance);
      return;
    }
    const exchangeRate = this.needsRate() ? parseTypedAmount(this.rate()) : undefined;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.store.adjust(this.pocket.id, {
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

  private async saveValuation(): Promise<void> {
    const value = parseTypedAmount(this.real().trim());
    if (value === undefined) {
      this.error.set(this.texts.errorValue);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.investments.saveValuations({
        items: [{ pocketId: this.pocket.id, date: this.date(), value }],
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
