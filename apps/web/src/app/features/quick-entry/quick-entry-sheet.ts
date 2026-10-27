import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { LucidePencil } from '@lucide/angular';
import { impliedRate, LocalDate, Money, toDecimal } from '@platin/domain';
import {
  applyKey,
  displayAmount,
  isValidAmount,
  KeypadKey,
  parseTypedAmount,
  PlAmountKeypad,
  PlButton,
  PlChip,
  PlEmptyState,
  PlSegmented,
  PlDateField,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
  PlSheet,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from '../cards/cards.store';
import { CategoriesStore } from '../categories/categories.store';
import { RatesStore } from '../../core/rates.store';
import { TransactionsStore } from '../transactions/transactions.store';
import { QUICK_ENTRY_TEXTS } from './quick-entry.texts';

type Mode = 'EXPENSE' | 'INCOME' | 'TRANSFER';

/**
 * MOV-01/02 in three taps: amount on the keypad, a recent category, save. The account used
 * last is preselected and the date defaults to today.
 */
@Component({
  selector: 'pl-quick-entry-sheet',
  imports: [
    PlSheet,
    PlButton,
    PlSegmented,
    PlChip,
    PlAmountKeypad,
    PlEmptyState,
    PlSelect,
    PlDateField,
    LucidePencil,
  ],
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
          @if (card()) {
            <button
              type="button"
              class="font-amount min-h-11 rounded-full border border-line px-4 text-sm"
              [attr.aria-label]="texts.currencyToggle(amountCurrency())"
              (click)="cardCurrency.set(cardCurrency() === 'ARS' ? 'USD' : 'ARS')"
            >
              {{ amountCurrency() }} ⇄
            </button>
          } @else {
            <span class="font-amount rounded-full border border-line px-3 py-1 text-sm">
              {{ amountCurrency() }}
            </span>
          }
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
            <pl-select
              appearance="tile"
              [label]="card() ? texts.card : texts.account"
              [options]="paymentOptions()"
              [value]="paymentValue()"
              (valueChange)="setPayment($event)"
            />
            <pl-date-field
              class="min-w-32"
              appearance="tile"
              [label]="texts.date"
              [max]="today.date()"
              [value]="date()"
              (valueChange)="setDate($event)"
            />
          </div>

          @if (card()) {
            <fieldset class="flex flex-col gap-2">
              <legend class="mb-2 text-sm text-muted">{{ texts.installments }}</legend>
              <div class="flex flex-wrap gap-2">
                @for (n of installmentOptions; track n) {
                  <button
                    plChip
                    tone="ink"
                    [selected]="installments() === n"
                    (click)="installments.set(n)"
                  >
                    {{ n === 1 ? texts.onePayment : n }}
                  </button>
                }
              </div>
            </fieldset>
          }

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
              <span class="text-xs text-muted">{{ rateHint() }}</span>
            </label>
          }
        } @else {
          <!-- Transfer -->
          <div class="grid grid-cols-2 gap-2">
            <pl-select
              appearance="tile"
              [label]="texts.from"
              [options]="accountsStore.options()"
              [value]="accountId()"
              (valueChange)="accountId.set($event)"
            />
            <pl-select
              appearance="tile"
              [label]="texts.to"
              placeholder="—"
              [options]="accountsStore.options()"
              [value]="toAccountId()"
              (valueChange)="toAccountId.set($event)"
            />
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
          <pl-date-field
            appearance="tile"
            [label]="texts.date"
            [max]="today.date()"
            [value]="date()"
            (valueChange)="setDate($event)"
          />
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
  protected readonly ref = inject(DialogRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly today = inject(Today);
  protected readonly accountsStore = inject(AccountsStore);
  private readonly categoriesStore = inject(CategoriesStore);
  private readonly cardsStore = inject(CardsStore);
  private readonly ratesStore = inject(RatesStore);
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
  /** Paying with a card (expenses only): the purchase goes to the card's statements. */
  protected readonly cardId = signal<string | null>(null);
  protected readonly cardCurrency = signal<'ARS' | 'USD'>('ARS');
  protected readonly installments = signal(1);
  protected readonly installmentOptions = [1, 3, 6, 12];

  protected readonly cards = computed(() => this.cardsStore.cards().filter((c) => !c.archived));
  protected readonly card = computed(() =>
    this.mode() === 'EXPENSE' ? this.cardsStore.byId(this.cardId()) : undefined,
  );
  protected readonly paymentValue = computed(() =>
    this.card() ? `card:${this.cardId()}` : this.accountId(),
  );
  /** Accounts and, for an expense, the cards (value "card:<id>"), in two groups. */
  protected readonly paymentOptions = computed<PlSelectOption[]>(() => [
    ...this.accountsStore
      .options()
      .map((option) => ({ ...option, group: this.texts.accountsGroup })),
    ...(this.mode() === 'EXPENSE'
      ? this.cards().map((card) => ({
          value: `card:${card.id}`,
          label: card.name,
          tone: 'card' as const,
          group: this.texts.cardsGroup,
        }))
      : []),
  ]);

  protected readonly accounts = computed(() =>
    this.accountsStore.accounts().filter((account) => !account.archived),
  );
  protected readonly account = computed(() => this.accountsStore.byId(this.accountId()));
  protected readonly toAccount = computed(() => this.accountsStore.byId(this.toAccountId()));
  protected readonly amountCurrency = computed(() =>
    this.card() ? this.cardCurrency() : (this.account()?.currency ?? 'ARS'),
  );
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
    return (
      this.mode() !== 'TRANSFER' &&
      !this.card() &&
      !!this.account() &&
      this.amountCurrency() !== base
    );
  });
  protected readonly rateHint = computed(() => {
    const rate = this.ratesStore.preferred();
    if (!rate) return this.texts.rateHintNoRate;
    return this.texts.rateHint(
      rate.type,
      displayAmount(toDecimal(rate.sell).toFixed(2).replace(/\.00$/, '')),
    );
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
    if (event.defaultPrevented) return;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    // Keys inside an open picker (select or calendar panel) belong to it.
    const pane = target?.closest?.('.cdk-overlay-pane');
    if (pane && pane !== this.host.nativeElement.closest('.cdk-overlay-pane')) return;
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
    } else if (event.key === 'Enter' && target?.tagName !== 'BUTTON') {
      event.preventDefault();
      void this.save();
    }
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected setPayment(value: string | null): void {
    if (!value) return;
    if (value.startsWith('card:')) {
      this.cardId.set(value.slice(5));
    } else {
      this.cardId.set(null);
      this.accountId.set(value);
    }
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
      } else if (this.card()) {
        const categoryId = this.categoryId() as string;
        await this.cardsStore.createCharge(this.cardId() as string, {
          description: description ?? this.categoriesStore.byId(categoryId)?.name ?? '—',
          categoryId,
          totalAmount: this.amount(),
          currency: this.cardCurrency(),
          date: this.date(),
          installmentsCount: this.installments(),
        });
        this.categoriesStore.markUsed(categoryId);
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
    if (!this.account() && !this.card()) return errors.account;
    if (this.mode() === 'TRANSFER') {
      if (!this.toAccount()) return errors.account;
      if (this.toAccountId() === this.accountId()) return errors.sameAccount;
      if (this.crossCurrency() && !parseTypedAmount(this.receivedText())) return errors.received;
      return null;
    }
    if (!this.categoryId()) return errors.category;
    return null;
  }
}
