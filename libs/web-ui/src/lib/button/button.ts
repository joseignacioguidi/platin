import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PlButtonVariant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger';
export type PlButtonSize = 'md' | 'lg' | 'sm' | 'icon';

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 font-semibold transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

const VARIANTS: Record<PlButtonVariant, string> = {
  primary: 'bg-ink text-on-ink hover:opacity-90',
  brand: 'bg-brand text-ink hover:bg-brand-hover hover:text-on-ink',
  secondary: 'border border-line bg-surface text-ink hover:bg-field',
  ghost: 'text-ink hover:bg-field',
  danger: 'border border-expense text-ink hover:bg-expense-soft',
};

const SIZES: Record<PlButtonSize, string> = {
  sm: 'min-h-11 rounded-full px-4 text-sm',
  md: 'min-h-11 rounded-full px-5 text-[15px]',
  lg: 'min-h-14 w-full rounded-[18px] px-6 text-[17px]',
  icon: 'size-11 rounded-full',
};

/**
 * Button styles on a real `<button>` or `<a>`:
 * `<button plButton="secondary" size="lg">Guardar</button>`.
 * Icon-only buttons must set `aria-label`.
 */
@Component({
  // Attribute selector on purpose: keeps real <button>/<a> elements for accessibility.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[plButton], a[plButton]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
})
export class PlButton {
  readonly variant = input<PlButtonVariant, PlButtonVariant | ''>('primary', {
    alias: 'plButton',
    transform: (value) => value || 'primary',
  });
  readonly size = input<PlButtonSize>('md');

  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]}`,
  );
}
