import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { Goal } from '@platin/contracts';
import { LocalDate } from '@platin/domain';
import { parseTypedAmount, PlButton, PlDateField, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { SavingsStore } from './savings.store';
import { SAVINGS_TEXTS } from './savings.texts';

/** MET-02: assign a contribution (or a withdrawal) to a goal without linked accounts. */
@Component({
  selector: 'pl-contribution-sheet',
  imports: [PlSheet, PlButton, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title + ' · ' + goal.name">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.amount }} ({{ goal.currency }})</span>
        <input
          type="text"
          inputmode="decimal"
          [class]="input + ' font-amount'"
          [value]="amount()"
          (input)="amount.set(value($event))"
        />
      </label>
      <pl-form-field [label]="t.date" controlId="contribution-date">
        <pl-date-field
          inputId="contribution-date"
          [label]="t.date"
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
export class ContributionSheet {
  protected readonly t = SAVINGS_TEXTS.contribution;
  protected readonly input = INPUT_CLASS;
  protected readonly goal = inject<Goal>(DIALOG_DATA);
  private readonly store = inject(SavingsStore);
  private readonly ref = inject(DialogRef);

  protected readonly amount = signal('');
  protected readonly date = signal<LocalDate>(inject(Today).date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected async save(): Promise<void> {
    const typed = this.amount().trim();
    const negative = typed.startsWith('-');
    const parsed = parseTypedAmount(negative ? typed.slice(1) : typed);
    if (!parsed) return this.error.set('Ingresá un monto.');
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.contribute(this.goal.id, {
        amount: negative ? `-${parsed}` : parsed,
        date: this.date(),
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
