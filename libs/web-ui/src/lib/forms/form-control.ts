import { computed, Directive, input, ModelSignal, signal } from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';

let nextId = 0;

/** Unique ids for label/listbox/option wiring. */
export function plUniqueId(prefix: string): string {
  return `${prefix}-${++nextId}`;
}

/**
 * Shared plumbing of the custom form controls: they work both with a signal (`[(value)]`) and
 * with Reactive Forms (`formControlName`), through ControlValueAccessor.
 */
@Directive()
export abstract class PlFormControl<T> implements ControlValueAccessor {
  abstract readonly value: ModelSignal<T>;
  readonly disabled = input(false);

  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  private onChange: (value: T) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  writeValue(value: T): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  /** A value chosen by the user: updates the signal and notifies the form. */
  protected commit(value: T): void {
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
  }
}

/** Trigger of the `chip` appearance: a 44 px pill that fits in a row (MOV-09). */
export function chipTrigger(open: boolean, invalid: boolean): string {
  const border = invalid ? 'border-expense' : open ? 'border-brand' : 'border-line';
  return (
    `inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border ${border} bg-surface ` +
    'px-3.5 text-[15px] text-ink transition-colors focus:outline-none focus-visible:border-brand ' +
    'focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60'
  );
}
