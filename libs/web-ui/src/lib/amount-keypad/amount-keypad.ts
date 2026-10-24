import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { LucideDelete } from '@lucide/angular';
import { applyKey, KeypadKey } from './amount-input';

/** Numeric keypad of the quick entry. Edits a raw decimal string (two-way bound). */
@Component({
  selector: 'pl-amount-keypad',
  imports: [LucideDelete],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid grid-cols-3 gap-2' },
  template: `
    @for (key of keys; track key) {
      <button
        type="button"
        class="font-amount flex h-[50px] items-center justify-center rounded-[18px] bg-field text-2xl text-ink active:bg-line"
        [attr.aria-label]="label(key)"
        (click)="press(key)"
      >
        @if (key === 'back') {
          <svg lucideDelete [size]="24"></svg>
        } @else {
          {{ key }}
        }
      </button>
    }
  `,
})
export class PlAmountKeypad {
  readonly value = model.required<string>();

  protected readonly keys: KeypadKey[] = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    ',',
    '0',
    'back',
  ];

  protected press(key: KeypadKey): void {
    this.value.set(applyKey(this.value(), key));
  }

  protected label(key: KeypadKey): string | null {
    if (key === 'back') return 'Borrar';
    if (key === ',') return 'Coma decimal';
    return null;
  }
}
