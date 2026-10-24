import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

export interface PlSegmentOption<T> {
  value: T;
  label: string;
}

/**
 * Single choice among a few options (Gasto / Ingreso / Transferencia), as an ARIA radio group
 * with arrow-key navigation.
 */
@Component({
  selector: 'pl-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="label()"
      class="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl p-1"
      [class.bg-field]="tone() === 'ink'"
      [class.bg-line-soft]="tone() === 'surface'"
    >
      @for (option of options(); track option.value; let i = $index) {
        <button
          #segment
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          [tabIndex]="option.value === value() ? 0 : -1"
          class="min-h-11 rounded-xl px-3 text-[15px] font-medium transition-colors"
          [class]="option.value === value() ? selectedClass() : 'text-ink hover:bg-surface/60'"
          (click)="value.set(option.value)"
          (keydown)="onKeydown($event, i)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class PlSegmented<T> {
  readonly options = input.required<readonly PlSegmentOption<T>[]>();
  readonly value = model.required<T>();
  readonly label = input.required<string>();
  /** `ink`: selected option filled with ink (quick entry); `surface`: white pill (tabs). */
  readonly tone = input<'ink' | 'surface'>('ink');

  private readonly segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');

  protected selectedClass(): string {
    return this.tone() === 'ink'
      ? 'bg-ink text-on-ink font-semibold'
      : 'bg-surface text-ink font-semibold shadow-sm';
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const options = this.options();
    const next = (index + step + options.length) % options.length;
    this.value.set(options[next].value);
    this.segments()[next]?.nativeElement.focus();
  }
}
