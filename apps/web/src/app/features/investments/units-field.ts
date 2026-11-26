import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import type { Pricing } from '@platin/contracts';
import { Money, parseLocalDate, unitsForAmount } from '@platin/domain';
import { formatDate, parseTypedAmount } from '@platin/web-ui';
import { INVESTMENTS_TEXTS } from './investments.texts';

/**
 * INV-09: the units bought or sold with a linked investment. It proposes amount ÷ last price and
 * keeps whatever the person types instead (the one on the receipt).
 */
@Component({
  selector: 'pl-units-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1.5' },
  template: `
    <label class="text-sm font-medium" [for]="inputId()">{{ label() }}</label>
    <input
      [id]="inputId()"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      class="font-amount min-h-12 rounded-2xl border border-line bg-surface px-4 text-[17px]"
      [value]="units()"
      (input)="type($event)"
    />
    <p class="text-sm text-muted" aria-live="polite">{{ hint() }}</p>
  `,
})
export class UnitsField {
  protected readonly t = INVESTMENTS_TEXTS.units;
  readonly pricing = input.required<Pricing>();
  /** The amount as typed, in the investment's currency. */
  readonly amount = input<string>('');
  readonly inputId = input('units-field');
  readonly units = model('');
  private readonly edited = signal(false);

  protected readonly label = computed(
    () => this.t.names[this.pricing().listing?.type ?? 'OTHER'],
  );
  protected readonly hint = computed(() => {
    const date = this.pricing().priceDate;
    return this.pricing().price && date
      ? this.t.proposed(formatDate(parseLocalDate(date)))
      : this.t.noPrice;
  });

  constructor() {
    effect(() => {
      const price = this.pricing().price;
      const amount = parseTypedAmount(this.amount());
      const currency = this.pricing().listing?.currency;
      if (untracked(() => this.edited()) || !price || !amount || !currency) return;
      const units = unitsForAmount(Money.of(amount, currency), price);
      this.units.set(units.toFixed(8).replace(/\.?0+$/, '').replace('.', ','));
    });
  }

  protected type(event: Event): void {
    this.edited.set(true);
    this.units.set((event.target as HTMLInputElement).value);
  }
}
