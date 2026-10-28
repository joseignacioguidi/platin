import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PlButton, PlSheet } from '@platin/web-ui';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { ADMIN_TEXTS } from './admin.texts';

export interface AdminConfirmData {
  heading: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  /** When set, the admin must type this text (the user's email) to confirm. */
  typeToConfirm?: { label: string; expected: string };
}

/** Confirmation for admin actions; resolves with the typed text (or "" when none was asked). */
@Component({
  selector: 'pl-admin-confirm-sheet',
  imports: [PlSheet, PlButton, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="data.heading">
      <p class="text-[15px]">{{ data.message }}</p>
      @if (data.typeToConfirm; as typed) {
        <pl-form-field [label]="typed.label" controlId="confirm-text">
          <input
            id="confirm-text"
            type="email"
            autocomplete="off"
            [class]="input"
            [placeholder]="typed.expected"
            [value]="text()"
            (input)="text.set(value($event))"
          />
        </pl-form-field>
      }
      <div class="grid grid-cols-2 gap-2">
        <button plButton="secondary" type="button" (click)="ref.close()">{{ t.cancel }}</button>
        <button
          [plButton]="data.danger ? 'danger' : 'primary'"
          type="button"
          [disabled]="!canConfirm()"
          (click)="ref.close(text())"
        >
          {{ data.confirmLabel }}
        </button>
      </div>
    </pl-sheet>
  `,
})
export class AdminConfirmSheet {
  protected readonly data = inject<AdminConfirmData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string>>(DialogRef);
  protected readonly t = ADMIN_TEXTS.user;
  protected readonly input = INPUT_CLASS;
  protected readonly text = signal('');
  protected readonly canConfirm = computed(() => {
    const typed = this.data.typeToConfirm;
    return !typed || this.text().trim().toLowerCase() === typed.expected.toLowerCase();
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
