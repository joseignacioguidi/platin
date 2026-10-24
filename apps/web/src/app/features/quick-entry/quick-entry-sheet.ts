import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { LucidePencil } from '@lucide/angular';
import { addDays, impliedRate, LocalDate, Money, parseLocalDate, toDecimal } from '@platin/domain';
import {
  applyKey,
  displayAmount,
  formatDate,
  isValidAmount,
  KeypadKey,
  parseTypedAmount,
  PlAmountKeypad,
  PlButton,
  PlChip,
  PlEmptyState,
  PlSegmented,
  PlSegmentOption,
  PlSheet,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CategoriesStore } from '../categories/categories.store';
import { TransactionsStore } from '../transactions/transactions.store';
import { QUICK_ENTRY_TEXTS } from './quick-entry.texts';

type Mode = 'EXPENSE' | 'INCOME' | 'TRANSFER';

const FIELD_BOX =
  'relative flex min-h-[60px] flex-col justify-center rounded-2xl border border-line px-4 focus-within:border-brand';
const OVERLAY_INPUT = 'absolute inset-0 h-full w-full cursor-pointer opacity-0';

/**
 * MOV-01/02 in three taps: amount on the keypad, a recent category, save. The account used
 * last is preselected and the date defaults to today.
 */
@Component({
  selector: 'pl-quick-entry-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlChip, PlAmountKeypad, PlEmptyState, LucidePencil],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet>
      @if (accountsStore.resource.hasValue() && accounts().length === 0) {
        <pl-empty-state
          icon="wallet"
          [heading]="texts.noAccountsTitle"
          [description]="texts.noAccountsBody"
        >
          <button plButton type="button" (click)="goCreateAccount()">
            {{ texts.createAccount }}
          </button>
        </pl-empty-state>
      } @else {
        <h2 class="sr-only">{{ texts.title }}</h2>
        <pl-segmented [label]="texts.typeLabel" [options]="modeOptions" [(value)]="mode" />

        <!-- Amount -->
        <div class="flex flex-col items-center gap-2 py-1">
          <p
            class="font-amount flex items-center text-5xl font-semibold tracking-tight"
            [attr.aria-label]="texts.amountLabel + ': ' + amountText()"
            aria-live="polite"
          >
            <span>{{ symbol() }}&nbsp;{{ amountText() }}</span>
            <span class="ml-1 h-12 w-1 animate-pulse rounded bg-brand" aria-hidden="true"></span>
          </p>
          <span class="font-amount rounded-full border border-line px-3 py-1 text-sm">
            {{ amountCurrency() }}
          </span>
        </div>

        @if (mode() !== 'TRANSFER') {
          <!-- Categories -->
          <section class="flex flex-col gap-2">
            <h3 class="text-sm text-muted">
              {{ showAllCategories() ? texts.categoryAll : texts.categoryRecent }}
            </h3>
            <div class="flex flex-wrap gap-2">
              @for (category of visibleCategories(); track category.id) {
                <button
                  plChip
                  [selected]="category.id === categoryId()"
                  (click)="categoryId.set(category.id)"
                >
                  {{ category.name }}
                </button>
              }
              <button plChip tone="dashed" (click)="showAllCategories.set(!showAllCategories())">
                {{ showAllCategories() ? texts.less : texts.more }}
              </button>
            </div>
          </section>

          <div class="grid grid-cols-[1fr_auto] gap-2">
            <label [class]="fieldBox">
              <span class="text-xs text-muted">{{ texts.account }}</span>
              <span class="flex items-center gap-2 truncate font-semibold">
                <span class="size-2.5 rounded-full bg-transfer" aria-hidden="true"></span>
                {{ account()?.name }}
              </span>
              <select
                [class]="overlayInput"
                [value]="accountId()"
                (change)="accountId.set(selectValue($event))"
              >
                @for (option of accounts(); track option.id) {
                  <option [value]="option.id">{{ option.name }} · {{ option.currency }}</option>
                }
              </select>
            </label>
            <label [class]="fieldBox + ' min-w-28'">
              <span class="text-xs text-muted">{{ texts.date }}</span>
              <span class="font-semibold">{{ dateLabel() }}</span>
              <input
                type="date"
                [class]="overlayInput"
                [value]="date()"
                [max]="today.date()"
                (change)="setDate($event)"
              />
            </label>
          </div>

          @if (needsRate()) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">{{ texts.rate }}</span>
              <input
                type="text"
                inputmode="decimal"
                class="font-amount min-h-12 rounded-2xl border border-line bg-surface px-4"
                [value]="rateText()"
                (input)="rateText.set(inputValue($event))"
              />
              <span class="text-xs text-muted">{{ texts.rateHint }}</span>
            </label>
          }
        } @else {
          <!-- Transfer -->
          <div class="grid grid-cols-2 gap-2">
            <label [class]="fieldBox">
              <span class="text-xs text-muted">{{ texts.from }}</span>
              <span class="truncate font-semibold">{{ account()?.name }}</span>
              <select
                [class]="overlayInput"
                [value]="accountId()"
                (change)="accountId.set(selectValue($event))"
              >
                @for (option of accounts(); track option.id) {
                  <option [value]="option.id">{{ option.name }} · {{ option.currency }}</option>
                }
              </select>
            </label>
            <label [class]="fieldBox">
              <span class="text-xs text-muted">{{ texts.to }}</span>
              <span class="truncate font-semibold">{{ toAccount()?.name ?? '—' }}</span>
              <select
                [class]="overlayInput"
                [value]="toAccountId() ?? ''"
                (change)="toAccountId.set(selectValue($event))"
              >
                <option value="" disabled>—</option>
                @for (option of accounts(); track option.id) {
                  <option [value]="option.id">{{ option.name }} · {{ option.currency }}</option>
                }
              </select>
            </label>
          </div>
          @if (crossCurrency()) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">
                {{ texts.received }} ({{ toAccount()?.currency }})
              </span>
              <input
                type="text"
                inputmode="decimal"
                class="font-amount min-h-12 rounded-2xl border border-line bg-surface px-4"
                [value]="receivedText()"
                (input)="receivedText.set(inputValue($event))"
              />
              @if (rateLabel()) {
                <span class="font-amount text-sm text-muted">{{ rateLabel() }}</span>
              }
            </label>
          }
          <label [class]="fieldBox">
            <span class="text-xs text-muted">{{ texts.date }}</span>
            <span class="font-semibold">{{ dateLabel() }}</span>
            <input
              type="date"
              [class]="overlayInput"
              [value]="date()"
              [max]="today.date()"
              (change)="setDate($event)"
            />
          </label>
        }

        @if (showNote()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ texts.note }}</span>
            <input
              type="text"
              maxlength="120"
              class="min-h-12 rounded-2xl border border-line bg-surface px-4"
              [placeholder]="texts.notePlaceholder"
              [value]="note()"
              (input)="note.set(inputValue($event))"
            />
          </label>
        }

        <pl-amount-keypad [(value)]="amount" />

        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }

        <div class="flex gap-2">
          <button
            plButton="secondary"
            size="icon"
            type="button"
            class="size-14! rounded-[18px]!"
            [attr.aria-label]="texts.noteToggle"
            [attr.aria-pressed]="showNote()"
            (click)="showNote.set(!showNote())"
          >
            <svg lucidePencil [size]="20"></svg>
          </button>
          <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
            {{ saving() ? texts.saving : texts.save[mode()] }}
          </button>
        </div>
      }
    </pl-sheet>
  `,
})
export class QuickEntrySheet {
  protected readonly texts = QUICK_ENTRY_TEXTS;
  protected readonly fieldBox = FIELD_BOX;
  protected readonly overlayInput = OVERLAY_INPUT;
  protected readonly ref = inject(DialogRef);
  protected readonly today = inject(Today);
  protected readonly accountsStore = inject(AccountsStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly transactions = inject(TransactionsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly modeOptions: PlSegmentOption<Mode>[] = (
    ['EXPENSE', 'INCOME', 'TRANSFER'] as const
  ).map((value) => ({ value, label: QUICK_ENTRY_TEXTS.types[value] }));

  protected readonly mode = signal<Mode>('EXPENSE');
  protected readonly amount = signal('');
  protected readonly accountId = signal<string | null>(null);
  protected readonly toAccountId = signal<string | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly note = signal('');
  protected readonly showNote = signal(false);
  protected readonly showAllCategories = signal(false);
  protected readonly receivedText = signal('');
  protected readonly rateText = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly accounts = computed(() =>
    this.accountsStore.accounts().filter((account) => !account.archived),
  );
  protected readonly account = computed(() => this.accountsStore.byId(this.accountId()));
  protected readonly toAccount = computed(() => this.accountsStore.byId(this.toAccountId()));
  protected readonly amountCurrency = computed(() => this.account()?.currency ?? 'ARS');
  protected readonly symbol = computed(() => (this.amountCurrency() === 'USD' ? 'USD' : '$'));
  protected readonly amountText = computed(() => displayAmount(this.amount()));

  protected readonly visibleCategories = computed(() => {
    const mode = this.mode();
    if (mode === 'TRANSFER') return [];
    const all = this.categoriesStore.ofKind(mode);
    if (this.showAllCategories()) return all;
    const recent = this.categoriesStore.recent(mode);
    const selected = all.find((c) => c.id === this.categoryId());
    return selected && !recent.includes(selected) ? [selected, ...recent.slice(0, 4)] : recent;
  });

  protected readonly needsRate = computed(() => {
    const base = this.auth.user()?.baseCurrency ?? 'ARS';
    return this.mode() !== 'TRANSFER' && !!this.account() && this.amountCurrency() !== base;
  });
  protected readonly crossCurrency = computed(
    () => !!this.toAccount() && this.toAccount()?.currency !== this.account()?.currency,
  );
  protected readonly rateLabel = computed(() => {
    const received = parseTypedAmount(this.receivedText());
    const from = this.account();
    const to = this.toAccount();
    if (!received || !from || !to || !isValidAmount(this.amount())) return null;
    const rate = impliedRate(
      Money.of(this.amount(), from.currency),
      Money.of(received, to.currency),
    );
    if (!rate) return null;
    const value = toDecimal(rate).toFixed(2).replace(/\.00$/, '');
    return this.texts.impliedRate(displayAmount(value));
  });

  protected readonly dateLabel = computed(() => {
    const date = this.date();
    if (date === this.today.date()) return this.texts.today;
    if (date === addDays(this.today.date(), -1)) return this.texts.yesterday;
    return formatDate(date);
  });

  constructor() {
    // Preselect the last used account (or the first) once accounts load.
    effect(() => {
      const accounts = this.accounts();
      if (this.accountId() || accounts.length === 0) return;
      const last = this.accountsStore.lastUsedId();
      this.accountId.set(accounts.find((a) => a.id === last)?.id ?? accounts[0].id);
    });
    // Changing the type resets the category (income and expense categories differ).
    effect(() => {
      this.mode();
      this.categoryId.set(null);
      this.error.set(null);
    });
  }

  /** On desktop the amount can be typed with the physical keyboard. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    const key: KeypadKey | null = /^[0-9]$/.test(event.key)
      ? (event.key as KeypadKey)
      : event.key === ',' || event.key === '.'
        ? ','
        : event.key === 'Backspace'
          ? 'back'
          : null;
    if (key) {
      event.preventDefault();
      this.amount.update((raw) => applyKey(raw, key));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void this.save();
    }
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(event: Event): void {
    const value = this.inputValue(event);
    if (value) this.date.set(parseLocalDate(value));
  }

  protected goCreateAccount(): void {
    this.ref.close();
    void this.router.navigate(['/app/cuentas'], { queryParams: { nueva: 1 } });
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const problem = this.validate();
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const accountId = this.accountId() as string;
    const description = this.note().trim() || undefined;
    try {
      if (this.mode() === 'TRANSFER') {
        await this.transactions.transfer({
          fromAccountId: accountId,
          toAccountId: this.toAccountId() as string,
          amountOut: this.amount(),
          amountIn: this.crossCurrency() ? parseTypedAmount(this.receivedText()) : undefined,
          date: this.date(),
          description,
        });
      } else {
        const categoryId = this.categoryId() as string;
        await this.transactions.create({
          type: this.mode() as 'EXPENSE' | 'INCOME',
          accountId,
          categoryId,
          amount: this.amount(),
          date: this.date(),
          description,
          exchangeRate: this.needsRate() ? parseTypedAmount(this.rateText()) : undefined,
        });
        this.categoriesStore.markUsed(categoryId);
      }
      this.accountsStore.rememberLastUsed(accountId);
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private validate(): string | null {
    const errors = this.texts.errors;
    if (!isValidAmount(this.amount())) return errors.amount;
    if (!this.account()) return errors.account;
    if (this.mode() === 'TRANSFER') {
      if (!this.toAccount()) return errors.account;
      if (this.toAccountId() === this.accountId()) return errors.sameAccount;
      if (this.crossCurrency() && !parseTypedAmount(this.receivedText())) return errors.received;
      return null;
    }
    if (!this.categoryId()) return errors.category;
    if (this.needsRate() && !parseTypedAmount(this.rateText())) return errors.rate;
    return null;
  }
}
