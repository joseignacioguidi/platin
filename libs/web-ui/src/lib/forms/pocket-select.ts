import {
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
import type { Currency, PocketKind } from '@platin/domain';
import { PlTone } from '../list-item/list-item';
import { HideAmounts } from '../money/hide-amounts';
import { moneyText } from '../money/money';
import { PlFormControl } from './form-control';
import { PlSelect, PlSelectOption } from './select';

/** What pl-pocket-select needs from a pocket (structurally the API's Pocket). */
export interface PlPocketOption {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  kind: PocketKind;
  currency: Currency;
  balance: string;
  archived: boolean;
}

/** Icon and tone of each kind of pocket, shared by every screen that lists pockets. */
export const PL_POCKET_ICONS: Record<PocketKind, { icon: string; tone: PlTone }> = {
  AVAILABLE: { icon: 'wallet', tone: 'transfer' },
  SAVINGS: { icon: 'piggy-bank', tone: 'savings' },
  INVESTMENT: { icon: 'trending-up', tone: 'card' },
};

/**
 * Pockets as select options grouped by account, with their balance as secondary text (shared
 * by pl-pocket-select and pickers that mix pockets with other things, like cards).
 */
export function pocketSelectOptions(
  pockets: readonly PlPocketOption[],
  hidden: boolean,
  display: 'pocket' | 'account' = 'pocket',
): PlSelectOption[] {
  return pockets.map((pocket) => ({
    value: pocket.id,
    label: display === 'account' ? `${pocket.accountName} · ${pocket.name}` : pocket.name,
    hint: moneyText(pocket.balance, pocket.currency, hidden),
    icon: PL_POCKET_ICONS[pocket.kind].icon,
    tone: PL_POCKET_ICONS[pocket.kind].tone,
    group: pocket.accountName,
    keywords: `${pocket.accountName} ${pocket.currency}`,
  }));
}

/**
 * pl-select with the pockets grouped by account, with currency and balance; it can be limited
 * to some kinds or a currency, and leave some pockets out (the origin of a transfer).
 */
@Component({
  selector: 'pl-pocket-select',
  imports: [PlSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlPocketSelect), multi: true },
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
export class PlPocketSelect extends PlFormControl<string | null> {
  readonly value = model<string | null>(null);
  readonly pockets = input.required<readonly PlPocketOption[]>();
  /** Only these kinds (all when empty). */
  readonly kinds = input<readonly PocketKind[]>([]);
  /** Only this currency. */
  readonly currency = input<Currency | null>(null);
  /** Pockets left out (the origin of a transfer). */
  readonly exclude = input<readonly string[]>([]);
  readonly label = input('Apartado');
  readonly inputId = input<string>();
  readonly placeholder = input('Elegí un apartado');
  readonly emptyLabel = input<string | null>(null);
  readonly appearance = input<'field' | 'tile'>('field');
  readonly invalid = input(false);
  /** `pocket`: "Disponible" under its account group. `account`: "Mercado Pago · Disponible". */
  readonly display = input<'pocket' | 'account'>('pocket');

  private readonly hideAmounts = inject(HideAmounts);
  private readonly select = viewChild.required(PlSelect);

  protected readonly options = computed<PlSelectOption[]>(() => {
    const kinds = this.kinds();
    const currency = this.currency();
    const exclude = this.exclude();
    const current = this.value();
    const visible = this.pockets().filter(
      (pocket) =>
        pocket.id === current ||
        (!pocket.archived &&
          (kinds.length === 0 || kinds.includes(pocket.kind)) &&
          (!currency || pocket.currency === currency) &&
          !exclude.includes(pocket.id)),
    );
    return pocketSelectOptions(visible, this.hideAmounts.hidden(), this.display());
  });

  open(): void {
    this.select().open();
  }
}
