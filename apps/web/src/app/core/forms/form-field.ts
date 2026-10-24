import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + control + error/hint, with the ids wired for screen readers. */
@Component({
  selector: 'pl-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1.5' },
  template: `
    <label [attr.for]="controlId()" class="text-sm font-medium">{{ label() }}</label>
    <ng-content />
    @if (error()) {
      <p [id]="controlId() + '-error'" class="text-sm text-ink" role="alert">
        <span class="font-semibold text-expense" aria-hidden="true">•</span> {{ error() }}
      </p>
    } @else if (hint()) {
      <p [id]="controlId() + '-hint'" class="text-sm text-muted">{{ hint() }}</p>
    }
  `,
})
export class FormField {
  readonly label = input.required<string>();
  readonly controlId = input.required<string>();
  readonly error = input<string | null>(null);
  readonly hint = input<string>();
}

/** Input styles shared by the forms. */
export const INPUT_CLASS =
  'min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink ' +
  'placeholder:text-muted focus:border-brand focus:outline-none aria-invalid:border-expense';
