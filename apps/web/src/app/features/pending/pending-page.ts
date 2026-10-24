import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { TransactionMovement } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import {
  displayAmount,
  formatDate,
  parseTypedAmount,
  PlButton,
  PlEmptyState,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { MovementsList } from '../transactions/movements-list';
import { TransactionsStore } from '../transactions/transactions.store';
import { PENDING_TEXTS } from './pending.texts';

interface Draft {
  selected: boolean;
  amount: string;
  rate: string;
}

/**
 * "Para confirmar" (MOV-05): pending movements of fixed items. Each one can be confirmed alone
 * or in batch, correcting the amount first.
 */
@Component({
  selector: 'pl-pending-page',
  imports: [PlButton, PlEmptyState],
  providers: [MovementsList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <p class="text-[15px] text-muted">{{ texts.intro }}</p>
    </header>

    @if (list.loaded() && items().length === 0) {
      <pl-empty-state
        icon="sparkles"
        [heading]="texts.emptyTitle"
        [description]="texts.emptyBody"
      />
    } @else {
      <label class="flex min-h-11 items-center gap-3 px-2">
        <input
          type="checkbox"
          class="size-5 accent-brand"
          [checked]="allSelected()"
          (change)="selectAll(!allSelected())"
        />
        <span class="font-medium">{{ texts.selectAll }}</span>
      </label>
      <ul class="flex flex-col gap-2">
        @for (item of items(); track item.id) {
          <li class="flex flex-col gap-3 rounded-tile bg-surface p-4">
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                class="mt-1 size-5 accent-brand"
                [attr.aria-label]="texts.select(item.description ?? '')"
                [checked]="draft(item).selected"
                (change)="patch(item, { selected: !draft(item).selected })"
              />
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-[17px] font-semibold">{{ item.description }}</span>
                <span class="text-sm text-muted">
                  {{ item.type === 'INCOME' ? texts.income : texts.expense }} ·
                  {{ item.account.name }} ·
                  {{ dateText(item.date) }}
                </span>
              </div>
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label class="flex min-w-0 flex-col gap-1">
                <span class="text-xs text-muted">{{ texts.amount }} ({{ item.currency }})</span>
                <input
                  type="text"
                  inputmode="decimal"
                  class="font-amount min-h-11 rounded-2xl border border-line bg-surface px-3"
                  [value]="draft(item).amount"
                  (input)="patch(item, { amount: value($event) })"
                />
              </label>
              <button
                plButton="brand"
                size="sm"
                type="button"
                [disabled]="busy()"
                (click)="confirm([item])"
              >
                {{ texts.confirm }}
              </button>
            </div>
            @if (needsRate(item)) {
              <label class="flex flex-col gap-1">
                <span class="text-xs text-muted">{{ texts.rate }}</span>
                <input
                  type="text"
                  inputmode="decimal"
                  class="font-amount min-h-11 rounded-2xl border border-line bg-surface px-3"
                  [value]="draft(item).rate"
                  (input)="patch(item, { rate: value($event) })"
                />
              </label>
            }
          </li>
        }
      </ul>
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button
        plButton
        size="lg"
        type="button"
        [disabled]="busy() || selected().length === 0"
        (click)="confirm(selected())"
      >
        {{ texts.confirmSelected(selected().length) }}
      </button>
    }
  `,
})
export class PendingPage {
  protected readonly texts = PENDING_TEXTS;
  protected readonly list = inject(MovementsList);
  private readonly store = inject(TransactionsStore);
  private readonly auth = inject(AuthService);

  private readonly drafts = signal<Record<string, Draft>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly items = computed(() =>
    this.list.items().filter((m): m is TransactionMovement => m.kind === 'TRANSACTION'),
  );
  protected readonly selected = computed(() => this.items().filter((i) => this.draft(i).selected));
  protected readonly allSelected = computed(
    () => this.items().length > 0 && this.selected().length === this.items().length,
  );

  constructor() {
    void this.list.load({ status: 'PENDING' });
    // New pending items start selected, with their expected amount.
    effect(() => {
      const current = this.drafts();
      const next = { ...current };
      for (const item of this.items()) {
        next[item.id] ??= {
          selected: true,
          amount: displayAmount(item.amount.replace(/\.00$/, '')),
          rate: '',
        };
      }
      if (Object.keys(next).length !== Object.keys(current).length) this.drafts.set(next);
    });
  }

  protected draft(item: TransactionMovement): Draft {
    return this.drafts()[item.id] ?? { selected: true, amount: item.amount, rate: '' };
  }

  protected patch(item: TransactionMovement, changes: Partial<Draft>): void {
    this.drafts.update((drafts) => ({ ...drafts, [item.id]: { ...this.draft(item), ...changes } }));
  }

  protected selectAll(selected: boolean): void {
    for (const item of this.items()) this.patch(item, { selected });
  }

  protected needsRate(item: TransactionMovement): boolean {
    return item.rateToBase === '0.000000' && item.currency !== this.auth.user()?.baseCurrency;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected dateText(date: string): string {
    return formatDate(parseLocalDate(date));
  }

  protected async confirm(items: TransactionMovement[]): Promise<void> {
    const payload = [];
    for (const item of items) {
      const draft = this.draft(item);
      const amount = parseTypedAmount(draft.amount);
      if (!amount) return this.error.set(this.texts.invalidAmount(item.description ?? ''));
      // Optional: without it the API freezes the rate of the movement's date.
      const exchangeRate = this.needsRate(item) ? parseTypedAmount(draft.rate) : undefined;
      payload.push({ id: item.id, amount, exchangeRate });
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.store.confirm(payload);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
