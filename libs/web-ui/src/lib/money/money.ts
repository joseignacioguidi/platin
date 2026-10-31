import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Currency, currencySymbol, formatMoney, Money } from '@platin/domain';
import { HideAmounts } from './hide-amounts';

export type PlMoneyTone = 'none' | 'income' | 'expense' | 'pending' | 'muted';

const TONES: Record<PlMoneyTone, string> = {
  none: '',
  income: 'text-brand-strong',
  expense: 'text-ink',
  pending: 'text-muted',
  muted: 'text-muted',
};

/**
 * Shows an amount in JetBrains Mono with aligned digits. Every amount in the app goes through
 * this component so "ocultar montos" hides them all.
 */
@Component({
  selector: 'pl-money',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'font-amount whitespace-nowrap', '[class]': 'toneClass()' },
  template: `
    @if (hideAmounts.hidden()) {
      <span aria-label="Monto oculto">{{ symbol() }} •••••</span>
    } @else {
      {{ text() }}
    }
  `,
})
export class PlMoney {
  /** Decimal string ("18500.00") or Money. */
  readonly amount = input.required<string | Money>();
  readonly currency = input<Currency>('ARS');
  /** `auto` shows cents only when they are not zero. */
  readonly decimals = input<boolean | 'auto'>('auto');
  readonly sign = input<'auto' | 'always' | 'never'>('auto');
  readonly tone = input<PlMoneyTone>('none');

  protected readonly hideAmounts = inject(HideAmounts);

  private readonly money = computed(() => {
    const amount = this.amount();
    return typeof amount === 'string' ? Money.of(amount, this.currency()) : amount;
  });

  protected readonly symbol = computed(() => currencySymbol(this.money().currency));
  protected readonly text = computed(() =>
    formatMoney(this.money(), { decimals: this.decimals(), signDisplay: this.sign() }),
  );
  protected readonly toneClass = computed(() => TONES[this.tone()]);
}

/**
 * Plain-text amount for places that can't host pl-money (secondary text of a select option).
 * Honors "ocultar montos" when `hidden` comes from HideAmounts.
 */
export function moneyText(amount: string, currency: Currency, hidden: boolean): string {
  if (hidden) return `${currencySymbol(currency)} •••••`;
  return formatMoney(Money.of(amount, currency), { decimals: 'auto', signDisplay: 'auto' });
}
