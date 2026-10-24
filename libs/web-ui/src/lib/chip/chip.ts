import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Category or filter chip on a real `<button>`: `<button plChip [selected]="x">Supermercado</button>`.
 * Exposes its state with aria-pressed.
 */
@Component({
  // Attribute selector on purpose: keeps a real <button> for accessibility.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[plChip]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    '[attr.aria-pressed]': 'selected()',
    '[class]': 'classes()',
  },
})
export class PlChip {
  readonly selected = input(false);
  /** `ink` for filters (selected = ink), `brand` for categories (selected = green). */
  readonly tone = input<'ink' | 'brand' | 'dashed'>('brand');

  protected readonly classes = computed(() => {
    const base =
      'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] font-medium transition-colors';
    if (this.tone() === 'dashed')
      return `${base} border border-dashed border-line text-muted hover:bg-field`;
    if (!this.selected()) return `${base} border border-line bg-surface text-ink hover:bg-field`;
    return this.tone() === 'ink'
      ? `${base} bg-ink font-semibold text-on-ink`
      : `${base} bg-brand-strong font-semibold text-on-ink`;
  });
}
