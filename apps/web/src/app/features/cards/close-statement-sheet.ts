import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { StatementSummary } from '@platin/contracts';
import { Money } from '@platin/domain';
import { parseTypedAmount, PlButton, PlCategorySelect, PlMoney, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { CategoriesStore } from '../categories/categories.store';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

/** TAR-07: close with the bank's totals; the difference becomes an adjustment. */
@Component({
  selector: 'pl-close-statement-sheet',
  imports: [PlSheet, PlButton, PlMoney, PlCategorySelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title">
      <p class="text-[15px] text-muted">{{ t.body }}</p>
      <p class="text-sm">
        {{ t.calculated }}:
        <pl-money [amount]="statement.totals.ARS" currency="ARS" />
        @if (statement.totals.USD !== '0.00') {
          · <pl-money [amount]="statement.totals.USD" currency="USD" />
        }
      </p>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.bankArs }}</span>
        <input
          type="text"
          inputmode="decimal"
          [class]="input + ' font-amount'"
          [value]="ars()"
          (input)="ars.set(value($event))"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.bankUsd }}</span>
        <input
          type="text"
          inputmode="decimal"
          [class]="input + ' font-amount'"
          [value]="usd()"
          (input)="usd.set(value($event))"
        />
      </label>
      @if (hasDifference()) {
        <pl-form-field [label]="t.category" controlId="close-category">
          <pl-category-select
            inputId="close-category"
            allowCreate
            kind="EXPENSE"
            [label]="t.category"
            [categories]="categoriesStore.categories()"
            [value]="categoryId()"
            (valueChange)="categoryId.set($event ?? '')"
          />
        </pl-form-field>
      }
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ t.save }}
      </button>
    </pl-sheet>
  `,
})
export class CloseStatementSheet {
  protected readonly t = CARDS_TEXTS.close;
  protected readonly input = INPUT_CLASS;
  protected readonly statement = inject<StatementSummary>(DIALOG_DATA);
  private readonly store = inject(CardsStore);
  protected readonly categoriesStore = inject(CategoriesStore);
  private readonly ref = inject(DialogRef);

  protected readonly ars = signal(this.statement.totals.ARS.replace(/\.00$/, '').replace('.', ','));
  protected readonly usd = signal(this.statement.totals.USD.replace(/\.00$/, '').replace('.', ','));
  protected readonly categoryId = signal(
    this.categoriesStore.ofKind('EXPENSE').find((c) => c.name.startsWith('Impuestos'))?.id ?? '',
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly hasDifference = computed(() => {
    const ars = parseTypedAmount(this.ars());
    const usd = parseTypedAmount(this.usd());
    return (
      (ars !== undefined &&
        !Money.of(ars, 'ARS').equals(Money.of(this.statement.totals.ARS, 'ARS'))) ||
      (usd !== undefined &&
        !Money.of(usd, 'USD').equals(Money.of(this.statement.totals.USD, 'USD')))
    );
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.close(this.statement.id, {
        bankTotalArs: parseTypedAmount(this.ars()),
        bankTotalUsd: parseTypedAmount(this.usd()),
        adjustmentCategoryId: this.hasDifference() ? this.categoryId() || undefined : undefined,
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
