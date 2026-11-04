import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Movement } from '@platin/contracts';
import { CategoryKind, compareDates, LocalDate, parseLocalDate } from '@platin/domain';
import {
  displayAmount,
  formatDate,
  parseTypedAmount,
  PlBottomSheet,
  PlButton,
  PlCategorySelect,
  PlDateField,
  PlAccountSelect,
  PlSheet,
  formatRate,
} from '@platin/web-ui';
import { AccountsStore } from '../accounts/accounts.store';
import { errorMessage } from '../../core/errors';
import { FormField } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { ChargeFormData, ChargeFormSheet } from '../cards/charge-form-sheet';
import { CardsStore } from '../cards/cards.store';
import { CategoriesStore } from '../categories/categories.store';
import { MovementRow } from './movement-row';
import { TransactionsStore } from './transactions.store';
import { TRANSACTIONS_TEXTS } from './transactions.texts';

const INPUT =
  'min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base focus:border-brand focus:outline-none';

/** MOV-04: see, edit, confirm or delete one movement. */
@Component({
  selector: 'pl-movement-sheet',
  imports: [
    PlSheet,
    PlButton,
    PlCategorySelect,
    PlDateField,
    PlAccountSelect,
    FormField,
    MovementRow,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet>
      <pl-movement-row [movement]="movement" />

      @if (editable) {
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ texts.amount }}</span>
            <input
              type="text"
              inputmode="decimal"
              [class]="input + ' font-amount'"
              [value]="amountText()"
              (input)="amountText.set(value($event))"
            />
          </label>
          @if (categoryKind(); as kind) {
            <pl-form-field [label]="texts.category" controlId="movement-category">
              <pl-category-select
                inputId="movement-category"
                allowCreate
                [kind]="kind"
                [label]="texts.category"
                [categories]="categoriesStore.categories()"
                [recentIds]="categoriesStore.recentIds()"
                [value]="categoryId() || null"
                (valueChange)="categoryId.set($event ?? '')"
              />
            </pl-form-field>
          }
          @if (movement.kind === 'TRANSACTION' && categoryKind()) {
            <!-- MOV-04: another account with a balance in the same currency. -->
            <pl-form-field [label]="texts.account" controlId="movement-pocket">
              <pl-account-select
                inputId="movement-pocket"
                [label]="texts.account"
                [pockets]="accountsStore.pockets()"
                [currency]="movement.currency"
                [value]="pocketId()"
                (valueChange)="pocketId.set($event ?? pocketId())"
              />
            </pl-form-field>
            <p class="-mt-1 text-xs text-muted">{{ texts.sameCurrency(movement.currency) }}</p>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ texts.description }}</span>
            <input
              type="text"
              maxlength="120"
              [class]="input"
              [value]="description()"
              (input)="description.set(value($event))"
            />
          </label>
          <pl-form-field [label]="texts.date" controlId="movement-date">
            <!-- MOV-08: only a pending income or expense can wait for a future date. -->
            <pl-date-field
              inputId="movement-date"
              [label]="texts.date"
              [max]="pending && categoryKind() ? null : today.date()"
              [value]="date()"
              (valueChange)="setDate($event)"
            />
          </pl-form-field>
          @if (scheduled()) {
            <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink" role="status">
              {{ texts.scheduledHint }}
            </p>
          }
        </div>
      } @else {
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          <dt class="text-muted">{{ texts.date }}</dt>
          <dd>{{ dateText }}</dd>
          @if (movement.kind === 'TRANSFER' && movement.impliedRate) {
            <dt class="text-muted">{{ texts.rate }}</dt>
            <dd class="font-amount">
              {{ rateText(movement.currencyOut, movement.currencyIn, movement.impliedRate) }}
            </dd>
          }
        </dl>
      }

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      @if (confirmingDelete()) {
        <p class="text-[15px] font-semibold">{{ texts.confirmDelete }}</p>
        <div class="grid grid-cols-2 gap-2">
          <button plButton="secondary" type="button" (click)="confirmingDelete.set(false)">
            {{ texts.cancel }}
          </button>
          <button plButton="danger" type="button" [disabled]="busy()" (click)="remove()">
            {{ texts.confirmDeleteYes }}
          </button>
        </div>
      } @else {
        @if (pending) {
          <button plButton="brand" size="lg" type="button" [disabled]="busy()" (click)="confirm()">
            {{ texts.confirmPending }}
          </button>
        }
        @if (editable) {
          <button plButton size="lg" type="button" [disabled]="busy()" (click)="save()">
            {{ scheduled() ? texts.schedule : texts.save }}
          </button>
        }
        @if (movement.kind === 'CARD_CHARGE') {
          <button plButton size="lg" type="button" [disabled]="busy()" (click)="editCharge()">
            {{ texts.editCharge }}
          </button>
        }
        <div class="grid grid-cols-2 gap-2">
          <button plButton="secondary" type="button" (click)="ref.close()">
            {{ texts.close }}
          </button>
          @if (deletable) {
            <button plButton="danger" type="button" (click)="confirmingDelete.set(true)">
              {{ texts.delete }}
            </button>
          }
        </div>
      }
    </pl-sheet>
  `,
})
export class MovementSheet {
  protected readonly texts = TRANSACTIONS_TEXTS.detail;
  protected readonly rateText = formatRate;
  protected readonly input = INPUT;
  protected readonly ref = inject(DialogRef);
  protected readonly movement = inject<Movement>(DIALOG_DATA);
  private readonly store = inject(TransactionsStore);
  protected readonly categoriesStore = inject(CategoriesStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly cardsStore = inject(CardsStore);
  protected readonly today = inject(Today);
  protected readonly accountsStore = inject(AccountsStore);

  /** Statement payments are undone from the card, not from the list. */
  protected readonly deletable = !(this.movement.kind === 'TRANSFER' && this.movement.statement);
  protected readonly editable =
    this.movement.kind === 'TRANSACTION' && this.movement.type !== 'ADJUSTMENT';
  protected readonly pending =
    this.movement.kind === 'TRANSACTION' && this.movement.status === 'PENDING';
  protected readonly dateText = formatDate(parseLocalDate(this.movement.date));

  protected readonly amountText = signal(
    this.movement.kind === 'TRANSACTION'
      ? displayAmount(this.movement.amount.replace(/\.00$/, ''))
      : '',
  );
  protected readonly categoryId = signal(
    this.movement.kind === 'TRANSACTION' ? (this.movement.category?.id ?? '') : '',
  );
  protected readonly description = signal(this.movement.description ?? '');
  protected readonly pocketId = signal<string | null>(
    this.movement.kind === 'TRANSACTION' ? this.movement.pocket.id : null,
  );
  protected readonly date = signal<LocalDate>(parseLocalDate(this.movement.date));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);

  protected readonly categoryKind = computed<CategoryKind | null>(() =>
    this.movement.kind === 'TRANSACTION' &&
    (this.movement.type === 'INCOME' || this.movement.type === 'EXPENSE')
      ? this.movement.type
      : null,
  );

  /** A pending income or expense dated after today stays scheduled (MOV-08). */
  protected readonly scheduled = computed(
    () => this.pending && !!this.categoryKind() && compareDates(this.date(), this.today.date()) > 0,
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  /** TAR-11: a card purchase is edited in its own form (it has installments). */
  protected async editCharge(): Promise<void> {
    if (this.movement.kind !== 'CARD_CHARGE') return;
    const card = this.cardsStore.byId(this.movement.card.id);
    this.busy.set(true);
    try {
      const charge = await this.cardsStore.getCharge(this.movement.id);
      if (!card) throw new Error('Card not loaded');
      this.ref.close();
      this.sheet.open(ChargeFormSheet, {
        data: { card, charge } satisfies ChargeFormData,
        ariaLabel: this.texts.editCharge,
      });
    } catch {
      this.error.set(this.texts.chargeLoadError);
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const amount = parseTypedAmount(this.amountText());
    if (!amount) {
      this.error.set('Ingresá un monto válido.');
      return;
    }
    await this.run(() =>
      this.store.update(this.movement.id, {
        amount,
        categoryId: this.categoryId() || undefined,
        description: this.description().trim() || null,
        date: this.date(),
        ...(this.movement.kind === 'TRANSACTION' && this.pocketId() !== this.movement.pocket.id
          ? { pocketId: this.pocketId() as string }
          : {}),
      }),
    );
  }

  protected async confirm(): Promise<void> {
    await this.run(() => this.store.confirm([{ id: this.movement.id }]));
  }

  protected async remove(): Promise<void> {
    const { kind, id } = this.movement;
    await this.run(() =>
      kind === 'TRANSFER'
        ? this.store.removeTransfer(id)
        : kind === 'CARD_CHARGE'
          ? this.cardsStore.removeCharge(id)
          : this.store.remove(id),
    );
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
