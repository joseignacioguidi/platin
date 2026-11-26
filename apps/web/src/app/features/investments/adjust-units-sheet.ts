import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { InvestmentPocket } from '@platin/contracts';
import type { LocalDate } from '@platin/domain';
import { PlButton, PlDateField, PlSegmented, PlSegmentOption, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { formatUnits, parseTypedUnits } from './investment-format';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';

/** INV-10: adds or subtracts units with a date and a reason, without moving money. */
@Component({
  selector: 'pl-adjust-units-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title + ' · ' + pocket.name">
      <p class="text-sm text-muted">{{ t.hint }}</p>
      @if (pocket.pricing.units) {
        <p class="font-amount text-[15px]">
          {{ unitsName }}: {{ formatUnits(pocket.pricing.units) }}
        </p>
      }
      <pl-segmented [label]="t.title" [options]="directions" [(value)]="direction" />
      <pl-form-field [label]="t.units" controlId="adjust-units">
        <input
          id="adjust-units"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          [class]="input + ' font-amount'"
          [value]="units()"
          (input)="units.set(value($event))"
        />
      </pl-form-field>
      <pl-form-field [label]="t.date" controlId="adjust-date">
        <pl-date-field
          inputId="adjust-date"
          [label]="t.date"
          [max]="today.date()"
          [value]="date()"
          (valueChange)="setDate($event)"
        />
      </pl-form-field>
      <pl-form-field [label]="t.note" controlId="adjust-note">
        <input
          id="adjust-note"
          type="text"
          maxlength="120"
          [class]="input"
          [placeholder]="t.notePlaceholder"
          [value]="note()"
          (input)="note.set(value($event))"
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
export class AdjustUnitsSheet {
  protected readonly t = INVESTMENTS_TEXTS.adjust;
  protected readonly input = INPUT_CLASS;
  protected readonly formatUnits = formatUnits;
  protected readonly pocket = inject<InvestmentPocket>(DIALOG_DATA);
  protected readonly today = inject(Today);
  private readonly store = inject(InvestmentsStore);
  private readonly ref = inject(DialogRef);
  protected readonly unitsName =
    INVESTMENTS_TEXTS.units.names[this.pocket.pricing.listing?.type ?? 'OTHER'];
  protected readonly directions: PlSegmentOption<'IN' | 'OUT'>[] = [
    { value: 'IN', label: this.t.add },
    { value: 'OUT', label: this.t.subtract },
  ];
  protected readonly direction = signal<'IN' | 'OUT'>('IN');
  protected readonly units = signal('');
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected async save(): Promise<void> {
    const units = parseTypedUnits(this.units());
    if (!units || !/[1-9]/.test(units)) return this.error.set(INVESTMENTS_TEXTS.units.invalid);
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.addAdjustment(this.pocket.id, {
        date: this.date(),
        units,
        direction: this.direction(),
        note: this.note().trim() || undefined,
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
