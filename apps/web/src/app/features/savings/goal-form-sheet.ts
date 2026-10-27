import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { Goal } from '@platin/contracts';
import { addMonths, Currency, parsePeriod, Period } from '@platin/domain';
import {
  parseTypedAmount,
  periodOptions,
  PlButton,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { SavingsStore } from './savings.store';
import { SAVINGS_TEXTS } from './savings.texts';

/** MET-01/02: create or edit a goal and choose the accounts that count for it. */
@Component({
  selector: 'pl-goal-form-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlSelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="goal ? f.edit : f.new">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ f.name }}</span>
        <input
          type="text"
          maxlength="60"
          [class]="input"
          [placeholder]="f.namePlaceholder"
          [value]="name()"
          (input)="name.set(value($event))"
        />
      </label>
      <div class="grid grid-cols-[1fr_auto] gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ f.amount }}</span>
          <input
            type="text"
            inputmode="decimal"
            [class]="input + ' font-amount'"
            [value]="amount()"
            (input)="amount.set(value($event))"
          />
        </label>
        @if (!goal) {
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ f.currency }}</span>
            <pl-segmented [label]="f.currency" [options]="currencies" [(value)]="currency" />
          </div>
        }
      </div>
      <pl-form-field [label]="f.target" controlId="goal-target">
        <pl-select
          inputId="goal-target"
          [label]="f.target"
          [options]="months"
          [value]="target()"
          (valueChange)="target.set($event)"
        />
      </pl-form-field>
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-sm font-medium">{{ f.accounts }}</legend>
        @for (account of accounts.accounts(); track account.id) {
          <label class="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              class="size-5 accent-brand"
              [checked]="selected().includes(account.id)"
              (change)="toggle(account.id)"
            />
            <span class="flex-1">{{ account.name }}</span>
            <span class="font-amount text-sm text-muted">{{ account.currency }}</span>
          </label>
        }
        <p class="text-xs text-muted">{{ f.accountsHint }}</p>
      </fieldset>
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ goal ? f.save : f.create }}
      </button>
    </pl-sheet>
  `,
})
export class GoalFormSheet {
  protected readonly f = SAVINGS_TEXTS.form;
  protected readonly input = INPUT_CLASS;
  protected readonly goal = inject<Goal | null>(DIALOG_DATA);
  protected readonly accounts = inject(AccountsStore);
  private readonly store = inject(SavingsStore);
  private readonly ref = inject(DialogRef);
  protected readonly minPeriod = addMonths(inject(Today).period(), 1);

  protected readonly currencies: PlSegmentOption<Currency>[] = [
    { value: 'USD', label: 'USD' },
    { value: 'ARS', label: 'ARS' },
  ];
  protected readonly name = signal(this.goal?.name ?? '');
  protected readonly amount = signal(this.goal?.targetAmount.replace(/\.00$/, '') ?? '');
  protected readonly currency = signal<Currency>(this.goal?.currency ?? 'USD');
  private readonly goalTarget = this.goal ? parsePeriod(this.goal.targetPeriod) : null;
  protected readonly target = signal<Period | null>(
    this.goalTarget ?? addMonths(this.minPeriod, 11),
  );
  /** Up to ten years ahead; an older target of an existing goal stays selectable. */
  protected readonly months = periodOptions(
    this.goalTarget && this.goalTarget < this.minPeriod ? this.goalTarget : this.minPeriod,
    0,
    120,
  );
  protected readonly selected = signal<string[]>(this.goal?.accounts.map((a) => a.id) ?? []);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected toggle(id: string): void {
    this.selected.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected async save(): Promise<void> {
    const amount = parseTypedAmount(this.amount());
    if (!this.name().trim()) return this.error.set('Ingresá un nombre.');
    if (!amount) return this.error.set('Ingresá el monto objetivo.');
    const target = this.target();
    if (!target) return this.error.set('Elegí el mes objetivo.');
    this.saving.set(true);
    this.error.set(null);
    try {
      const goal = this.goal;
      const result = goal
        ? await this.store.update(goal.id, {
            name: this.name().trim(),
            targetAmount: amount,
            targetPeriod: target,
            accountIds: this.selected(),
          })
        : await this.store.create({
            name: this.name().trim(),
            targetAmount: amount,
            currency: this.currency(),
            targetPeriod: target,
            accountIds: this.selected(),
          });
      this.ref.close(result);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
