import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Card, Charge, UpdateChargeRequest } from '@platin/contracts';
import {
  CardCurrency,
  formatMoney,
  LocalDate,
  Money,
  parseLocalDate,
  parsePeriod,
  Period,
  scheduleInstallments,
  splitInstallments,
  statementPeriodFor,
  totalFromInstallment,
} from '@platin/domain';
import {
  displayAmount,
  formatPeriodShort,
  parseTypedAmount,
  PlButton,
  PlCategorySelect,
  PlCurrencySelect,
  PlChip,
  PlDateField,
  PlMoney,
  PlSegmented,
  PlSegmentOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { CategoriesStore } from '../categories/categories.store';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

const COUNTS = [1, 3, 6, 12, 18, 24];
const MODE_KEY = 'platin.chargeAmountMode';

type AmountMode = 'TOTAL' | 'INSTALLMENT';

function rememberedMode(): AmountMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'INSTALLMENT' ? 'INSTALLMENT' : 'TOTAL';
  } catch {
    return 'TOTAL';
  }
}

function rememberMode(mode: AmountMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private mode: it just isn't remembered.
  }
}

export interface ChargeFormData {
  card: Card;
  /** Editing an existing charge (TAR-11); without it, a new one (TAR-02/03). */
  charge?: Charge;
}

/** TAR-02/03/11: a card purchase, with a live preview of how its installments are spread. */
@Component({
  selector: 'pl-charge-form-sheet',
  imports: [
    PlSheet,
    PlButton,
    PlChip,
    PlMoney,
    PlSegmented,
    PlCurrencySelect,
    PlCategorySelect,
    PlDateField,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="(charge ? t.editTitle : t.title) + ' · ' + card.name">
      @if (locked) {
        <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink" role="note">
          {{ t.locked }}
        </p>
      }
      <pl-form-field [label]="t.description" controlId="charge-description">
        <input
          id="charge-description"
          type="text"
          maxlength="120"
          [class]="input"
          [placeholder]="t.descriptionPlaceholder"
          [value]="description()"
          (input)="description.set(value($event))"
        />
      </pl-form-field>
      @if (!locked) {
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium" id="charge-amount-mode">{{ t.amountMode }}</span>
          <pl-segmented
            tone="surface"
            [label]="t.amountMode"
            [options]="modeOptions"
            [value]="mode()"
            (valueChange)="setMode($event)"
          />
        </div>
      }
      <div class="grid grid-cols-[1fr_auto] gap-3">
        <pl-form-field
          [label]="mode() === 'INSTALLMENT' ? t.installmentAmount : t.amount"
          controlId="charge-amount"
          [hint]="otherValue() ?? undefined"
        >
          <input
            id="charge-amount"
            type="text"
            inputmode="decimal"
            [class]="input + ' font-amount disabled:opacity-60'"
            [disabled]="locked"
            [value]="amountText()"
            (input)="amountText.set(value($event))"
          />
        </pl-form-field>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ t.currency }}</span>
          @if (charge) {
            <span
              class="font-amount flex min-h-12 items-center rounded-2xl bg-field px-4 text-muted"
              >{{ currency() }}</span
            >
          } @else {
            <pl-currency-select cardOnly [label]="t.currency" [(value)]="currency" />
          }
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <pl-form-field [label]="t.category" controlId="charge-category">
          <pl-category-select
            inputId="charge-category"
            allowCreate
            kind="EXPENSE"
            [label]="t.category"
            [categories]="categoriesStore.categories()"
            [recentIds]="categoriesStore.recentIds()"
            [value]="categoryId() || null"
            (valueChange)="categoryId.set($event ?? '')"
          />
        </pl-form-field>
        <pl-form-field [label]="t.date" controlId="charge-date">
          <pl-date-field
            inputId="charge-date"
            [label]="t.date"
            [max]="today.date()"
            [disabled]="locked"
            [value]="date()"
            (valueChange)="setDate($event)"
          />
        </pl-form-field>
      </div>

      <fieldset class="flex flex-col gap-2" [disabled]="locked">
        <legend class="mb-2 text-sm font-medium">{{ t.installments }}</legend>
        <div class="flex flex-wrap gap-2" [class.opacity-60]="locked">
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

      @if (count() > 1 && !charge) {
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

      @if (confirmingRemove()) {
        <p class="text-[15px] font-semibold">{{ t.confirmRemove }}</p>
        <div class="grid grid-cols-2 gap-2">
          <button plButton="secondary" type="button" (click)="confirmingRemove.set(false)">
            {{ t.cancel }}
          </button>
          <button plButton="danger" type="button" [disabled]="saving()" (click)="remove()">
            {{ t.confirmRemoveYes }}
          </button>
        </div>
      } @else {
        <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
          {{ charge ? t.saveChanges : t.save }}
        </button>
        @if (charge && !locked) {
          <button plButton="danger" type="button" (click)="confirmingRemove.set(true)">
            {{ t.remove }}
          </button>
        }
      }
    </pl-sheet>
  `,
})
export class ChargeFormSheet {
  protected readonly texts = CARDS_TEXTS;
  protected readonly t = CARDS_TEXTS.charge;
  protected readonly input = INPUT_CLASS;
  protected readonly counts = COUNTS;
  private readonly data = inject<ChargeFormData>(DIALOG_DATA);
  protected readonly card = this.data.card;
  protected readonly charge = this.data.charge;
  protected readonly locked = this.charge?.locked ?? false;
  protected readonly today = inject(Today);
  protected readonly categoriesStore = inject(CategoriesStore);
  private readonly store = inject(CardsStore);
  private readonly ref = inject(DialogRef);

  protected readonly description = signal(this.charge?.description ?? '');
  protected readonly amountText = signal(
    this.charge
      ? displayAmount(this.charge.totalAmount.replace(/\.00$/, '').replace('.', ','))
      : '',
  );
  protected readonly currency = signal<CardCurrency>(this.charge?.currency ?? 'ARS');
  protected readonly categoryId = signal(this.charge?.categoryId ?? '');
  protected readonly date = signal<LocalDate>(
    this.charge ? parseLocalDate(this.charge.date) : this.today.date(),
  );
  protected readonly count = signal(this.charge?.installmentsCount ?? 1);
  protected readonly started = signal(false);
  protected readonly startAt = signal(2);
  protected readonly saving = signal(false);
  protected readonly confirmingRemove = signal(false);
  protected readonly error = signal<string | null>(null);

  /** First installment of the plan: an existing charge keeps its own. */
  private readonly start = computed(() =>
    this.charge
      ? this.charge.startInstallment
      : this.started() && this.count() > 1
        ? this.startAt()
        : 1,
  );

  /** Same rules as the API: first statement by date (or today's open one for a started plan). */
  protected readonly preview = computed(() => {
    const amount = this.total();
    const start = this.start();
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

  protected readonly modeOptions: PlSegmentOption<AmountMode>[] = [
    { value: 'TOTAL', label: CARDS_TEXTS.charge.modes.TOTAL },
    { value: 'INSTALLMENT', label: CARDS_TEXTS.charge.modes.INSTALLMENT },
  ];
  /** TAR-02: the amount typed is the total or one installment, as the bank shows it. */
  protected readonly mode = signal<AmountMode>(
    (this.charge?.installmentsCount ?? 1) > 1 ? rememberedMode() : 'TOTAL',
  );

  /** The purchase total, whatever the mode: installment × count with "Por cuota". */
  protected readonly total = computed(() => {
    const amount = parseTypedAmount(this.amountText());
    if (!amount) return undefined;
    return this.mode() === 'INSTALLMENT'
      ? totalFromInstallment(Money.of(amount, this.currency()), this.count()).toString()
      : amount;
  });

  /** The value not typed, computed live ("Total: $ 549.999,96" or "Cuota: $ 45.833,33"). */
  protected readonly otherValue = computed(() => {
    const amount = parseTypedAmount(this.amountText());
    if (!amount || this.count() < 2) return null;
    const money = Money.of(amount, this.currency());
    return this.mode() === 'INSTALLMENT'
      ? this.t.totalIs(formatMoney(totalFromInstallment(money, this.count())))
      : this.t.installmentIs(this.count(), formatMoney(money.split(this.count())[0]));
  });

  /** Chosen by hand in this form: changing the installments no longer changes it. */
  private modeTouched = false;

  protected setMode(mode: AmountMode): void {
    this.mode.set(mode);
    this.modeTouched = true;
    rememberMode(mode);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected numberValue(event: Event): number {
    return Number.parseInt(this.value(event), 10) || 1;
  }

  protected setCount(n: number): void {
    if (this.locked) return;
    const previous = this.count();
    this.count.set(Math.min(60, Math.max(1, n)));
    // Going to more than one installment brings back the last mode used, unless the user
    // already chose one in this form.
    if (previous === 1 && this.count() > 1 && !this.modeTouched) this.mode.set(rememberedMode());
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected async save(): Promise<void> {
    const typed = parseTypedAmount(this.amountText());
    const amount = this.total();
    const errors = this.t.errors;
    if (!this.description().trim()) return this.error.set(errors.description);
    if (!amount) return this.error.set(errors.amount);
    if (!this.categoryId()) return this.error.set(errors.category);
    const charge = this.charge;
    await this.run(async () => {
      if (charge) {
        await this.store.updateCharge(charge.id, this.changes(charge, amount));
      } else {
        const byInstallment = this.mode() === 'INSTALLMENT' && this.count() > 1;
        await this.store.createCharge(this.card.id, {
          description: this.description().trim(),
          ...(byInstallment ? { installmentAmount: typed } : { totalAmount: amount }),
          currency: this.currency(),
          categoryId: this.categoryId(),
          date: this.date(),
          installmentsCount: this.count(),
          startInstallment: this.start(),
        });
      }
      this.categoriesStore.markUsed(this.categoryId());
    });
  }

  protected async remove(): Promise<void> {
    const charge = this.charge;
    if (charge) await this.run(() => this.store.removeCharge(charge.id));
  }

  /** Only what changed: a locked charge can't touch amount, date or installments (TAR-11). */
  private changes(charge: Charge, amount: string): UpdateChargeRequest {
    const changes: UpdateChargeRequest = {
      description: this.description().trim(),
      categoryId: this.categoryId(),
    };
    if (this.locked) return changes;
    if (!Money.of(amount, charge.currency).equals(Money.of(charge.totalAmount, charge.currency)))
      changes.totalAmount = amount;
    if (this.date() !== charge.date) changes.date = this.date();
    if (this.count() !== charge.installmentsCount) changes.installmentsCount = this.count();
    return changes;
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
