import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { FixedItem } from '@platin/contracts';
import { FixedKind, parsePeriod, Period } from '@platin/domain';
import {
  parseTypedAmount,
  periodOptions,
  PlButton,
  PlCategorySelect,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { FixedStore } from './fixed.store';
import { FIXED_TEXTS } from './fixed.texts';

const FREQUENCIES = [1, 2, 3, 6, 12] as const;

/** FIJ-01 and FIJ-03: create, edit, pause, finish or delete a fixed item. */
@Component({
  selector: 'pl-fixed-form-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlSelect, PlCategorySelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="fixed ? texts.edit : texts.new">
      @if (!fixed) {
        <pl-segmented [label]="f.kind" [options]="kinds" [(value)]="kind" />
      }
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
      @if (!fixed) {
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
      }
      <pl-form-field [label]="f.category" controlId="fixed-category">
        <pl-category-select
          inputId="fixed-category"
          [label]="f.category"
          [kind]="kind()"
          [categories]="categoriesStore.categories()"
          [recentIds]="categoriesStore.recentIds()"
          [value]="categoryId() || null"
          (valueChange)="categoryId.set($event ?? '')"
        />
      </pl-form-field>
      <pl-form-field [label]="f.account" controlId="fixed-account">
        <pl-select
          inputId="fixed-account"
          [label]="f.account"
          [options]="accounts.options()"
          [value]="accountId() || null"
          (valueChange)="accountId.set($event ?? '')"
        />
      </pl-form-field>
      <div class="grid grid-cols-2 gap-3">
        @if (!fixed) {
          <pl-form-field [label]="f.frequency" controlId="fixed-frequency">
            <pl-select
              inputId="fixed-frequency"
              [label]="f.frequency"
              [options]="frequencyOptions"
              [value]="interval()"
              (valueChange)="interval.set($event ?? 1)"
            />
          </pl-form-field>
        }
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ f.day }}</span>
          <input
            type="number"
            min="1"
            max="31"
            inputmode="numeric"
            [class]="input + ' font-amount'"
            [value]="day()"
            (input)="day.set(+value($event))"
          />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        @if (!fixed) {
          <pl-form-field [label]="f.start" controlId="fixed-start">
            <pl-select
              inputId="fixed-start"
              [label]="f.start"
              [options]="months"
              [value]="start()"
              (valueChange)="start.set($event ?? today.period())"
            />
          </pl-form-field>
        }
        <pl-form-field [label]="f.end" controlId="fixed-end">
          <pl-select
            inputId="fixed-end"
            [label]="f.end"
            [options]="months"
            [emptyLabel]="f.noEnd"
            [value]="end()"
            (valueChange)="end.set($event)"
          />
        </pl-form-field>
      </div>

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ fixed ? f.save : f.create }}
      </button>
      @if (fixed) {
        <div class="grid grid-cols-2 gap-2">
          <button plButton="secondary" type="button" [disabled]="saving()" (click)="togglePause()">
            {{ fixed.paused ? f.resume : f.pause }}
          </button>
          <button plButton="secondary" type="button" [disabled]="saving()" (click)="finish()">
            {{ f.finish }}
          </button>
        </div>
        <button plButton="danger" type="button" [disabled]="saving()" (click)="remove()">
          {{ f.remove }}
        </button>
      }
    </pl-sheet>
  `,
})
export class FixedFormSheet {
  protected readonly texts = FIXED_TEXTS;
  protected readonly f = FIXED_TEXTS.form;
  protected readonly input = INPUT_CLASS;
  protected readonly fixed = inject<FixedItem | null>(DIALOG_DATA);
  protected readonly accounts = inject(AccountsStore);
  protected readonly categoriesStore = inject(CategoriesStore);
  private readonly store = inject(FixedStore);
  protected readonly today = inject(Today);
  private readonly ref = inject(DialogRef);

  protected readonly kinds: PlSegmentOption<FixedKind>[] = [
    { value: 'EXPENSE', label: FIXED_TEXTS.form.kinds.EXPENSE },
    { value: 'INCOME', label: FIXED_TEXTS.form.kinds.INCOME },
  ];
  protected readonly kind = signal<FixedKind>(this.fixed?.kind ?? 'EXPENSE');
  protected readonly name = signal(this.fixed?.name ?? '');
  protected readonly amount = signal('');
  protected readonly categoryId = signal(this.fixed?.category.id ?? '');
  protected readonly accountId = signal(
    this.fixed?.account?.id ?? this.accounts.accounts()[0]?.id ?? '',
  );
  protected readonly interval = signal<number>(this.fixed?.intervalMonths ?? 1);
  protected readonly day = signal(this.fixed?.dayOfMonth ?? 10);
  protected readonly start = signal<Period>(
    this.fixed ? parsePeriod(this.fixed.startPeriod) : this.today.period(),
  );
  protected readonly end = signal<Period | null>(
    this.fixed?.endPeriod ? parsePeriod(this.fixed.endPeriod) : null,
  );
  protected readonly frequencyOptions: PlSelectOption<number>[] = FREQUENCIES.map((n) => ({
    value: n,
    label: FIXED_TEXTS.form.frequencies[n],
  }));
  protected readonly months = periodOptions(this.today.period(), 24, 60);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    if (!this.name().trim()) return this.error.set('Ingresá un nombre.');
    if (!this.categoryId() || !this.accountId()) return this.error.set('Elegí categoría y cuenta.');
    const fixed = this.fixed;
    if (fixed) {
      await this.run(() =>
        this.store.update(fixed.id, {
          name: this.name().trim(),
          categoryId: this.categoryId(),
          accountId: this.accountId(),
          dayOfMonth: this.day(),
          endPeriod: this.end(),
        }),
      );
      return;
    }
    const amount = parseTypedAmount(this.amount());
    if (!amount) return this.error.set('Ingresá el monto.');
    await this.run(() =>
      this.store.create({
        kind: this.kind(),
        name: this.name().trim(),
        categoryId: this.categoryId(),
        accountId: this.accountId(),
        amount,
        intervalMonths: this.interval(),
        dayOfMonth: this.day(),
        startPeriod: this.start(),
        endPeriod: this.end(),
      }),
    );
  }

  protected async togglePause(): Promise<void> {
    const fixed = this.fixed;
    if (fixed) await this.run(() => this.store.update(fixed.id, { paused: !fixed.paused }));
  }

  /** FIJ-03 "finalizar": this month is the last one. */
  protected async finish(): Promise<void> {
    const fixed = this.fixed;
    if (fixed)
      await this.run(() => this.store.update(fixed.id, { endPeriod: this.today.period() }));
  }

  protected async remove(): Promise<void> {
    const fixed = this.fixed;
    if (fixed) await this.run(() => this.store.remove(fixed.id));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await action();
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
