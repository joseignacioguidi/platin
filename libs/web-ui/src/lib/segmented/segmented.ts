import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChildren,
} from '@angular/core';
import { PlPlanBadge } from '../plan-badge/plan-badge';

export interface PlSegmentOption<T> {
  value: T;
  label: string;
  /**
   * PLN-07: the option is outside the user's plan. It shows `badge` and, when chosen, emits
   * `lockedChoose` instead of changing the value.
   */
  locked?: boolean;
  /** Plan mark shown next to a locked option ("Pro"). */
  badge?: string | null;
  /** Screen reader text of the lock ("No incluido en tu plan; está en Pro"). */
  lockedLabel?: string | null;
}

/**
 * Single choice among a few options (Gasto / Ingreso / Transferencia), as an ARIA radio group
 * with arrow-key navigation.
 */
@Component({
  selector: 'pl-segmented',
  imports: [PlPlanBadge],
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
          class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[15px] font-medium transition-colors"
          [class]="option.value === value() ? selectedClass() : 'text-ink hover:bg-surface/60'"
          (click)="choose(option)"
          (keydown)="onKeydown($event, i)"
        >
          {{ option.label }}
          @if (option.locked && option.badge) {
            <pl-plan-badge [plan]="option.badge" [srLabel]="option.lockedLabel ?? null" />
          }
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
  /** A locked option was chosen (PLN-07): the value stays as it was. */
  readonly lockedChoose = output<T>();

  private readonly segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');

  protected choose(option: PlSegmentOption<T>): void {
    if (option.locked) this.lockedChoose.emit(option.value);
    else this.value.set(option.value);
  }

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
    // Arrows only move among the options the plan includes; locked ones are reached by click.
    let next = index;
    for (let tries = 0; tries < options.length; tries++) {
      next = (next + step + options.length) % options.length;
      if (!options[next].locked) break;
    }
    if (options[next].locked) return;
    this.value.set(options[next].value);
    this.segments()[next]?.nativeElement.focus();
  }
}
