import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { addMonths, compareDates, Period } from '@platin/domain';
import { formatPeriod } from '../format/format';

/** "‹ Octubre 2026 ›" selector. */
@Component({
  selector: 'pl-month-picker',
  imports: [LucideChevronLeft, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center justify-between' },
  template: `
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-full hover:bg-field"
      aria-label="Mes anterior"
      (click)="value.set(previous())"
    >
      <svg lucideChevronLeft [size]="22"></svg>
    </button>
    <h2 class="text-xl font-bold" aria-live="polite">{{ label() }}</h2>
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-full hover:bg-field disabled:opacity-30"
      aria-label="Mes siguiente"
      [disabled]="atMax()"
      (click)="value.set(next())"
    >
      <svg lucideChevronRight [size]="22"></svg>
    </button>
  `,
})
export class PlMonthPicker {
  readonly value = model.required<Period>();
  /** Last selectable month (e.g. the current one for history). */
  readonly max = input<Period | null>(null);

  protected readonly label = computed(() => formatPeriod(this.value()));
  protected readonly previous = computed(() => addMonths(this.value(), -1));
  protected readonly next = computed(() => addMonths(this.value(), 1));
  protected readonly atMax = computed(() => {
    const max = this.max();
    return max !== null && compareDates(this.value(), max) >= 0;
  });
}
