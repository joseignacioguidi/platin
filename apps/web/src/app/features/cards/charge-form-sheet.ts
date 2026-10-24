import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Card } from '@platin/contracts';
import {
  Currency,
  LocalDate,
  Money,
  parseLocalDate,
  parsePeriod,
  Period,
  scheduleInstallments,
  splitInstallments,
  statementPeriodFor,
} from '@platin/domain';
import {
  formatPeriodShort,
  parseTypedAmount,
  PlButton,
  PlChip,
  PlMoney,
  PlSegmented,
  PlSegmentOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { CategoriesStore } from '../categories/categories.store';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

const COUNTS = [1, 3, 6, 12, 18, 24];

/** TAR-02/03 with a live preview of how the installments are spread over statements. */
@Component({
  selector: 'pl-charge-form-sheet',
  imports: [PlSheet, PlButton, PlChip, PlMoney, PlSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title + ' · ' + card.name">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t.description }}</span>
        <input
          type="text"
          maxlength="120"
          [class]="input"
          [placeholder]="t.descriptionPlaceholder"
          [value]="description()"
          (input)="description.set(value($event))"
        />
      </label>
      <div class="grid grid-cols-[1fr_auto] gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.amount }}</span>
          <input
            type="text"
            inputmode="decimal"
            [class]="input + ' font-amount'"
            [value]="amountText()"
            (input)="amountText.set(value($event))"
          />
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.currency }}</span>
          <pl-segmented [label]="t.currency" [options]="currencyOptions" [(value)]="currency" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.category }}</span>
          <select [class]="input" [value]="categoryId()" (change)="categoryId.set(value($event))">
            <option value="" disabled>—</option>
            @for (category of categories(); track category.id) {
              <option [value]="category.id">{{ category.name }}</option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.date }}</span>
          <input
            type="date"
            [class]="input"
            [value]="date()"
            [max]="today.date()"
            (change)="setDate($event)"
          />
        </label>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium">{{ t.installments }}</legend>
        <div class="flex flex-wrap gap-2">
          @for (n of counts; track n) {
            <button plChip tone="ink" [selected]="count() === n" (click)="setCount(n)">
              {{ n === 1 ? t.oneInstallment : n }}
            </button>
          }
          <input
            type="number"
            min="1"
            max="60"
            inputmode="numeric"
            class="font-amount min-h-11 w-20 rounded-full border border-line bg-surface px-3 text-center"
            [attr.aria-label]="t.installments"
            [value]="count()"
            (input)="setCount(numberValue($event))"
          />
        </div>
      </fieldset>

      @if (count() > 1) {
        <label class="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            class="size-5 accent-brand"
            [checked]="started()"
            (change)="started.set(!started())"
          />
          <span>{{ t.started }}</span>
        </label>
        @if (started()) {
          <label class="flex items-center gap-3">
            <span class="text-sm font-medium">{{ t.startAt }}</span>
            <input
              type="number"
              min="2"
              [max]="count()"
              class="font-amount min-h-11 w-20 rounded-2xl border border-line bg-surface px-3 text-center"
              [value]="startAt()"
              (input)="startAt.set(numberValue($event))"
            />
            <span class="text-sm text-muted">{{ texts.of }} {{ count() }}</span>
          </label>
        }
      }

      @if (preview().length > 0) {
        <section class="flex flex-col gap-2 rounded-tile bg-field p-4">
          <h3 class="text-sm font-semibold">{{ t.preview }}</h3>
          <ol class="flex flex-col gap-1 text-sm">
            @for (row of preview(); track row.label) {
              <li class="flex justify-between gap-2">
                <span>{{ row.label }}</span>
                @if (row.amount) {
                  <pl-money [amount]="row.amount" [currency]="currency()" decimals="auto" />
                }
              </li>
            }
          </ol>
        </section>
      }

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ t.save }}
      </button>
    </pl-sheet>
  `,
})
export class ChargeFormSheet {
  protected readonly texts = CARDS_TEXTS;
  protected readonly t = CARDS_TEXTS.charge;
  protected readonly input = INPUT_CLASS;
  protected readonly counts = COUNTS;
  protected readonly card = inject<Card>(DIALOG_DATA);
  protected readonly today = inject(Today);
  private readonly store = inject(CardsStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly ref = inject(DialogRef);

  protected readonly currencyOptions: PlSegmentOption<Currency>[] = [
    { value: 'ARS', label: 'ARS' },
    { value: 'USD', label: 'USD' },
  ];
  protected readonly description = signal('');
  protected readonly amountText = signal('');
  protected readonly currency = signal<Currency>('ARS');
  protected readonly categoryId = signal('');
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly count = signal(1);
  protected readonly started = signal(false);
  protected readonly startAt = signal(2);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly categories = computed(() => this.categoriesStore.ofKind('EXPENSE'));

  /** Same rules as the API: first statement by date (or today's open one for a started plan). */
  protected readonly preview = computed(() => {
    const amount = parseTypedAmount(this.amountText());
    const start = this.started() && this.count() > 1 ? this.startAt() : 1;
    if (!amount || start > this.count()) return [];
    const open = this.card.openStatement?.period;
    const first: Period =
      start > 1 && open ? parsePeriod(open) : statementPeriodFor(this.card, this.date());
    const plan = scheduleInstallments(
      splitInstallments(Money.of(amount, this.currency()), this.count(), start),
      first,
    );
    const rows = plan.map((i) => ({
      label: `${i.number}/${this.count()} · ${formatPeriodShort(i.period)}`,
      amount: i.amount.toString(),
    }));
    return rows.length > 4
      ? [...rows.slice(0, 2), { label: '…', amount: '' }, ...rows.slice(-1)]
      : rows;
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected numberValue(event: Event): number {
    return Number.parseInt(this.value(event), 10) || 1;
  }

  protected setCount(n: number): void {
    this.count.set(Math.min(60, Math.max(1, n)));
  }

  protected setDate(event: Event): void {
    const value = this.value(event);
    if (value) this.date.set(parseLocalDate(value));
  }

  protected async save(): Promise<void> {
    const amount = parseTypedAmount(this.amountText());
    if (!this.description().trim()) return this.error.set('Ingresá una descripción.');
    if (!amount) return this.error.set('Ingresá el monto total.');
    if (!this.categoryId()) return this.error.set('Elegí una categoría.');
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.createCharge(this.card.id, {
        description: this.description().trim(),
        totalAmount: amount,
        currency: this.currency(),
        categoryId: this.categoryId(),
        date: this.date(),
        installmentsCount: this.count(),
        startInstallment: this.started() && this.count() > 1 ? this.startAt() : 1,
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
