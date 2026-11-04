import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Currency } from '@platin/domain';
import { HideAmounts } from '../money/hide-amounts';
import { PlFormControl } from './form-control';
import { PlPocketOption, pocketSelectOptions } from './pocket-select';
import { PlSelect, PlSelectOption } from './select';

/**
 * Account balances as select options (one per account and currency: "Galicia", "Galicia · USD"),
 * with their balance. With `spending`, also the spending reserves ("Galicia · Cuotas").
 */
export function accountSelectOptions(
  pockets: readonly PlPocketOption[],
  hidden: boolean,
  spending = false,
): PlSelectOption[] {
  return pocketSelectOptions(
    pockets.filter((p) => p.kind === 'AVAILABLE' || (spending && p.kind === 'SPENDING')),
    hidden,
    'account',
  ).map((option) => ({ ...option, group: undefined }));
}

/**
 * pl-select of accounts, where an income, an expense, a fixed item or a payment goes
 * (iteration 6): never a reserve, except the spending reserves for card payments (`spending`).
 */
@Component({
  selector: 'pl-account-select',
  imports: [PlSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlAccountSelect), multi: true },
  ],
  host: { class: 'block min-w-0' },
  template: `
    <pl-select
      [options]="options()"
      [label]="label()"
      [inputId]="inputId()"
      [placeholder]="placeholder()"
      [emptyLabel]="emptyLabel()"
      [appearance]="appearance()"
      [invalid]="invalid()"
      [disabled]="isDisabled()"
      [value]="value()"
      (valueChange)="commit($event)"
    />
  `,
})
export class PlAccountSelect extends PlFormControl<string | null> {
  readonly value = model<string | null>(null);
  /** Every pocket of the user; the component keeps the account balances. */
  readonly pockets = input.required<readonly PlPocketOption[]>();
  /** Only this currency. */
  readonly currency = input<Currency | null>(null);
  /** Pockets left out (the origin of a transfer). */
  readonly exclude = input<readonly string[]>([]);
  /** Also the spending reserves (where a card is paid from, ADR 0024). */
  readonly spending = input(false, { transform: booleanAttribute });
  readonly label = input('Cuenta');
  readonly inputId = input<string>();
  readonly placeholder = input('Elegí una cuenta');
  readonly emptyLabel = input<string | null>(null);
  readonly appearance = input<'field' | 'tile' | 'chip'>('field');
  readonly invalid = input(false);

  private readonly hideAmounts = inject(HideAmounts);
  private readonly select = viewChild.required(PlSelect);

  protected readonly options = computed<PlSelectOption[]>(() => {
    const currency = this.currency();
    const exclude = this.exclude();
    const current = this.value();
    const visible = this.pockets().filter(
      (pocket) =>
        pocket.id === current ||
        (!pocket.archived &&
          (!currency || pocket.currency === currency) &&
          !exclude.includes(pocket.id)),
    );
    return accountSelectOptions(visible, this.hideAmounts.hidden(), this.spending());
  });

  open(): void {
    this.select().open();
  }
}
