import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Movement } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import {
  displayAmount,
  formatDate,
  parseTypedAmount,
  PlButton,
  PlMoney,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
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
  imports: [PlSheet, PlButton, PlMoney, MovementRow],
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
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ texts.category }}</span>
            <select [class]="input" [value]="categoryId()" (change)="categoryId.set(value($event))">
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}</option>
              }
            </select>
          </label>
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
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ texts.date }}</span>
            <input
              type="date"
              [class]="input"
              [value]="date()"
              (change)="date.set(value($event))"
            />
          </label>
        </div>
      } @else {
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          <dt class="text-muted">{{ texts.date }}</dt>
          <dd>{{ dateText }}</dd>
          @if (movement.kind === 'TRANSFER' && movement.impliedRate) {
            <dt class="text-muted">{{ texts.rate }}</dt>
            <dd class="font-amount">
              <pl-money [amount]="movement.impliedRate" decimals="auto" />
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
            {{ texts.save }}
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
  protected readonly input = INPUT;
  protected readonly ref = inject(DialogRef);
  protected readonly movement = inject<Movement>(DIALOG_DATA);
  private readonly store = inject(TransactionsStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly cardsStore = inject(CardsStore);

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
  protected readonly date = signal(this.movement.date);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);

  protected readonly categories = computed(() =>
    this.movement.kind === 'TRANSACTION' && this.movement.type !== 'ADJUSTMENT'
      ? this.categoriesStore.ofKind(this.movement.type)
      : [],
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
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
        date: parseLocalDate(this.date()),
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
