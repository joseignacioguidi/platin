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
  createAccountRequestSchema,
  nonNegativeAmountSchema,
} from '@platin/contracts';
import type { AccountType, Currency } from '@platin/domain';
import {
  parseTypedAmount,
  PlButton,
  PlSegmented,
  PlSegmentOption,
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

const TYPES: AccountType[] = ['CASH', 'BANK', 'WALLET', 'SAVINGS', 'INVESTMENT'];

/** CTA-01: create or edit an account (currency and initial balance only on creation). */
@Component({
  selector: 'pl-account-form-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlSelect, ReactiveFormsModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="account ? texts.edit : texts.new">
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
        <pl-form-field [label]="f.type" controlId="account-type">
          <pl-select
            inputId="account-type"
            [label]="f.type"
            [options]="typeOptions"
            formControlName="type"
          />
        </pl-form-field>

        @if (!account) {
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ f.currency }}</span>
            <pl-segmented [label]="f.currency" [options]="currencyOptions" [(value)]="currency" />
          </div>
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

        <label class="flex min-h-11 items-center gap-3">
          <input type="checkbox" class="size-5 accent-brand" formControlName="includeInNetWorth" />
          <span>{{ f.includeInNetWorth }}</span>
        </label>

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
  protected readonly typeOptions: PlSelectOption<AccountType>[] = TYPES.map((type) => ({
    value: type,
    label: ACCOUNTS_TEXTS.types[type],
  }));
  protected readonly account = inject<Account | null>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly store = inject(AccountsStore);

  protected readonly currencyOptions: PlSegmentOption<Currency>[] = (['ARS', 'USD'] as const).map(
    (value) => ({ value, label: ACCOUNTS_TEXTS.currencies[value] }),
  );
  protected readonly currency = signal<Currency>('ARS');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.account?.name ?? '', zodValidator(createAccountRequestSchema.shape.name)],
    type: [this.account?.type ?? ('WALLET' as AccountType)],
    initialBalance: ['0', nonNegativeAmountValidator],
    includeInNetWorth: [this.account?.includeInNetWorth ?? true],
  });

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const value = this.form.getRawValue();
    await this.run(() =>
      this.account
        ? this.store.update(this.account.id, {
            name: value.name.trim(),
            type: value.type,
            includeInNetWorth: value.includeInNetWorth,
          })
        : this.store.create({
            name: value.name.trim(),
            type: value.type,
            currency: this.currency(),
            initialBalance: parseTypedAmount(value.initialBalance) ?? '0',
            includeInNetWorth: value.includeInNetWorth,
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
