import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { FixedItem } from '@platin/contracts';
import { addMonths, Period } from '@platin/domain';
import { parseTypedAmount, periodOptions, PlButton, PlSelect, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { FixedStore } from './fixed.store';
import { FIXED_TEXTS } from './fixed.texts';

/** FIJ-02: a raise from a month on, without touching earlier months. */
@Component({
  selector: 'pl-change-amount-sheet',
  imports: [PlSheet, PlButton, PlSelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title + ' · ' + fixed.name">
      <p class="text-[15px] text-muted">{{ t.body }}</p>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.amount }} ({{ fixed.currency }})</span>
        <input
          type="text"
          inputmode="decimal"
          [class]="input + ' font-amount'"
          [value]="amount()"
          (input)="amount.set(value($event))"
        />
      </label>
      <pl-form-field [label]="t.from" controlId="amount-from">
        <pl-select
          inputId="amount-from"
          [label]="t.from"
          [options]="months"
          [value]="from()"
          (valueChange)="from.set($event)"
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
export class ChangeAmountSheet {
  protected readonly t = FIXED_TEXTS.amount;
  protected readonly input = INPUT_CLASS;
  protected readonly fixed = inject<FixedItem>(DIALOG_DATA);
  private readonly store = inject(FixedStore);
  private readonly ref = inject(DialogRef);

  protected readonly amount = signal('');
  private readonly today = inject(Today);
  protected readonly from = signal<Period | null>(addMonths(this.today.period(), 1));
  protected readonly months = periodOptions(this.today.period(), 12, 36);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    const amount = parseTypedAmount(this.amount());
    if (!amount) return this.error.set('Ingresá el nuevo monto.');
    const from = this.from();
    if (!from) return this.error.set('Elegí el mes.');
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.changeAmount(this.fixed.id, {
        amount,
        effectiveFrom: from,
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
