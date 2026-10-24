import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { type Card, createCardRequestSchema } from '@platin/contracts';
import { parseTypedAmount, PlButton, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { fieldError, zodValidator } from '../../core/forms/zod-validator';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

function optionalAmount(control: AbstractControl<string>): ValidationErrors | null {
  return !control.value.trim() || parseTypedAmount(control.value)
    ? null
    : { zod: 'Monto inválido' };
}

/** TAR-01: card with its closing and due days. */
@Component({
  selector: 'pl-card-form-sheet',
  imports: [PlSheet, PlButton, ReactiveFormsModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="card ? texts.edit : texts.new">
      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <pl-form-field
          [label]="f.name"
          controlId="card-name"
          [error]="fieldError(form.controls.name)"
        >
          <input
            id="card-name"
            type="text"
            [class]="inputClass"
            [placeholder]="f.namePlaceholder"
            formControlName="name"
          />
        </pl-form-field>
        <div class="grid grid-cols-2 gap-3">
          <pl-form-field
            [label]="f.closingDay"
            controlId="card-closing"
            [error]="fieldError(form.controls.closingDay)"
          >
            <input
              id="card-closing"
              type="number"
              inputmode="numeric"
              min="1"
              max="31"
              [class]="inputClass + ' font-amount'"
              formControlName="closingDay"
            />
          </pl-form-field>
          <pl-form-field
            [label]="f.dueDay"
            controlId="card-due"
            [error]="fieldError(form.controls.dueDay)"
          >
            <input
              id="card-due"
              type="number"
              inputmode="numeric"
              min="1"
              max="31"
              [class]="inputClass + ' font-amount'"
              formControlName="dueDay"
            />
          </pl-form-field>
        </div>
        <pl-form-field
          [label]="f.limit"
          controlId="card-limit"
          [error]="fieldError(form.controls.limit)"
        >
          <input
            id="card-limit"
            type="text"
            inputmode="decimal"
            [class]="inputClass + ' font-amount'"
            formControlName="limit"
          />
        </pl-form-field>
        <div class="grid grid-cols-2 gap-3">
          <pl-form-field [label]="f.issuer" controlId="card-issuer">
            <input id="card-issuer" type="text" [class]="inputClass" formControlName="issuer" />
          </pl-form-field>
          <pl-form-field
            [label]="f.last4"
            controlId="card-last4"
            [error]="fieldError(form.controls.last4)"
          >
            <input
              id="card-last4"
              type="text"
              inputmode="numeric"
              maxlength="4"
              [class]="inputClass + ' font-amount'"
              formControlName="last4"
            />
          </pl-form-field>
        </div>
        <pl-form-field [label]="f.defaultAccount" controlId="card-account">
          <select id="card-account" [class]="inputClass" formControlName="defaultPaymentAccountId">
            <option value="">{{ f.none }}</option>
            @for (account of accounts.accounts(); track account.id) {
              <option [value]="account.id">{{ account.name }}</option>
            }
          </select>
        </pl-form-field>
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="submit" [disabled]="saving()">
          {{ card ? f.save : f.create }}
        </button>
        @if (card) {
          <button plButton="danger" type="button" [disabled]="saving()" (click)="archive()">
            {{ f.archive }}
          </button>
        }
      </form>
    </pl-sheet>
  `,
})
export class CardFormSheet {
  protected readonly texts = CARDS_TEXTS;
  protected readonly f = CARDS_TEXTS.form;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly fieldError = fieldError;
  protected readonly card = inject<Card | null>(DIALOG_DATA);
  protected readonly accounts = inject(AccountsStore);
  private readonly store = inject(CardsStore);
  private readonly ref = inject(DialogRef);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.card?.name ?? '', zodValidator(createCardRequestSchema.shape.name)],
    closingDay: [
      this.card?.closingDay ?? 30,
      [Validators.required, Validators.min(1), Validators.max(31)],
    ],
    dueDay: [this.card?.dueDay ?? 5, [Validators.required, Validators.min(1), Validators.max(31)]],
    limit: [this.card?.creditLimit?.replace(/\.00$/, '') ?? '', optionalAmount],
    issuer: [this.card?.issuer ?? ''],
    last4: [this.card?.last4 ?? '', Validators.pattern(/^(\d{4})?$/)],
    defaultPaymentAccountId: [this.card?.defaultPaymentAccountId ?? ''],
  });

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const request = {
      name: v.name.trim(),
      closingDay: Number(v.closingDay),
      dueDay: Number(v.dueDay),
      creditLimit: parseTypedAmount(v.limit) ?? null,
      issuer: v.issuer.trim() || null,
      last4: v.last4 || null,
      defaultPaymentAccountId: v.defaultPaymentAccountId || null,
    };
    const card = this.card;
    await this.run(() => (card ? this.store.update(card.id, request) : this.store.create(request)));
  }

  protected async archive(): Promise<void> {
    const card = this.card;
    if (card) await this.run(() => this.store.update(card.id, { archived: true }));
  }

  private async run(action: () => Promise<Card>): Promise<void> {
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
