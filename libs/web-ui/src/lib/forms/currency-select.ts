import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  input,
  model,
  Signal,
} from '@angular/core';
import { CARD_CURRENCIES, Currency } from '@platin/domain';
import { PlSegmented, PlSegmentOption } from '../segmented/segmented';
import { PlSelect, PlSelectOption } from './select';

/** The currencies the signed-in user has enabled (MON-01). The app provides it. */
export const PL_ENABLED_CURRENCIES = new InjectionToken<Signal<readonly Currency[]>>(
  'PL_ENABLED_CURRENCIES',
);

/** Names of each currency, as the interface writes them. */
export const PL_CURRENCY_NAMES: Record<Currency, string> = {
  ARS: 'Pesos',
  USD: 'Dólares',
  EUR: 'Euros',
  BRL: 'Reales',
  CLP: 'Pesos chilenos',
  UYU: 'Pesos uruguayos',
};

/** With up to this many options it's a segmented control; with more, a list. */
const SEGMENTED_MAX = 3;

/**
 * The currency of a pocket, goal, fixed item or purchase: only the user's enabled currencies, or
 * only pesos and dollars with `cardOnly` (MON-05). The current value is always offered, even if
 * it was turned off later (editing something old).
 */
@Component({
  selector: 'pl-currency-select',
  imports: [PlSegmented, PlSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (codes().length <= segmentedMax) {
      <pl-segmented [label]="label()" [options]="segments()" [(value)]="value" />
    } @else {
      <pl-select
        [inputId]="inputId()"
        [label]="label()"
        [options]="options()"
        searchable="auto"
        [value]="value()"
        (valueChange)="value.set($event ?? value())"
      />
    }
  `,
})
export class PlCurrencySelect {
  readonly value = model.required<Currency>();
  readonly label = input('Moneda');
  readonly inputId = input<string>();
  /** Only ARS and USD: cards and their fixed items. */
  readonly cardOnly = input(false, { transform: booleanAttribute });

  private readonly enabled = inject(PL_ENABLED_CURRENCIES, { optional: true });
  protected readonly segmentedMax = SEGMENTED_MAX;

  protected readonly codes = computed<Currency[]>(() => {
    const base = this.cardOnly() ? CARD_CURRENCIES : (this.enabled?.() ?? CARD_CURRENCIES);
    const current = this.value();
    return base.includes(current) ? [...base] : [...base, current];
  });
  protected readonly segments = computed<PlSegmentOption<Currency>[]>(() =>
    this.codes().map((code) => ({ value: code, label: code })),
  );
  protected readonly options = computed<PlSelectOption<Currency>[]>(() =>
    this.codes().map((code) => ({ value: code, label: PL_CURRENCY_NAMES[code], hint: code })),
  );
}
