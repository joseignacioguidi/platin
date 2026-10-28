import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import {
  type Account,
  type ColorToken,
  createAccountRequestSchema,
  nonNegativeAmountSchema,
} from '@platin/contracts';
import type { AccountKind } from '@platin/domain';
import {
  parseTypedAmount,
  PlButton,
  PlColorPicker,
  PlSelect,
  PlSelectOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { fieldError, zodValidator } from '../../core/forms/zod-validator';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

/** Accepts "150.000,50" or "150000.50", zero included. */
function nonNegativeAmountValidator(control: AbstractControl<string>): ValidationErrors | null {
  const parsed = parseTypedAmount(control.value);
  return parsed !== undefined && nonNegativeAmountSchema.safeParse(parsed).success
    ? null
    : { zod: 'Ingresá un monto válido' };
}

const KINDS: AccountKind[] = ['BANK', 'WALLET', 'CASH', 'BROKER'];

/** Icon of each kind of account. */
export const ACCOUNT_KIND_ICONS: Record<AccountKind, string> = {
  BANK: 'landmark',
  WALLET: 'smartphone',
  CASH: 'banknote',
  BROKER: 'trending-up',
};

/** CTA-01: create or edit an account (the balance of its "Disponible" only on creation). */
@Component({
  selector: 'pl-account-form-sheet',
  imports: [PlSheet, PlButton, PlSelect, PlColorPicker, ReactiveFormsModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="account ? texts.edit : texts.newLabel">
      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <pl-form-field
          [label]="f.name"
          controlId="account-name"
          [error]="fieldError(form.controls.name)"
        >
          <input
            id="account-name"
            type="text"
            [class]="inputClass"
            [placeholder]="f.namePlaceholder"
            formControlName="name"
            [attr.aria-invalid]="!!fieldError(form.controls.name)"
          />
        </pl-form-field>
        <pl-form-field [label]="f.kind" controlId="account-kind">
          <pl-select
            inputId="account-kind"
            [label]="f.kind"
            [options]="kindOptions"
            formControlName="kind"
          />
        </pl-form-field>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ f.color }}</span>
          <pl-color-picker [label]="f.color" formControlName="color" />
        </div>

        @if (!account) {
          <pl-form-field
            [label]="f.initialBalance"
            controlId="account-balance"
            [hint]="f.initialBalanceHint"
            [error]="fieldError(form.controls.initialBalance)"
          >
            <input
              id="account-balance"
              type="text"
              inputmode="decimal"
              [class]="inputClass + ' font-amount'"
              formControlName="initialBalance"
            />
          </pl-form-field>
        }

        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="submit" [disabled]="saving()">
          {{ account ? f.save : f.create }}
        </button>
        @if (account) {
          <button plButton="danger" type="button" [disabled]="saving()" (click)="toggleArchive()">
            {{ account.archived ? f.unarchive : f.archive }}
          </button>
          @if (!account.archived) {
            <p class="text-xs text-muted">{{ f.archiveHint }}</p>
          }
        }
      </form>
    </pl-sheet>
  `,
})
export class AccountFormSheet {
  protected readonly texts = ACCOUNTS_TEXTS;
  protected readonly f = ACCOUNTS_TEXTS.form;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly fieldError = fieldError;
  protected readonly kindOptions: PlSelectOption<AccountKind>[] = KINDS.map((kind) => ({
    value: kind,
    label: ACCOUNTS_TEXTS.kinds[kind],
    icon: ACCOUNT_KIND_ICONS[kind],
  }));
  protected readonly account = inject<Account | null>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly store = inject(AccountsStore);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.account?.name ?? '', zodValidator(createAccountRequestSchema.shape.name)],
    kind: [this.account?.kind ?? ('WALLET' as AccountKind)],
    color: [(this.account?.color ?? 'transfer') as ColorToken],
    initialBalance: ['0', nonNegativeAmountValidator],
  });

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    await this.run(() =>
      this.account
        ? this.store.update(this.account.id, {
            name: value.name.trim(),
            kind: value.kind,
            color: value.color,
          })
        : this.store.create({
            name: value.name.trim(),
            kind: value.kind,
            color: value.color,
            initialBalance: parseTypedAmount(value.initialBalance) ?? '0',
          }),
    );
  }

  protected async toggleArchive(): Promise<void> {
    const account = this.account;
    if (!account) return;
    await this.run(() => this.store.update(account.id, { archived: !account.archived }));
  }

  private async run(action: () => Promise<Account>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      this.ref.close(await action());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
