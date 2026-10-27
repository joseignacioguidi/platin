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
