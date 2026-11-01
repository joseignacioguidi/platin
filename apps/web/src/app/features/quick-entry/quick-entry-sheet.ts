import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import type { Pocket } from '@platin/contracts';
import { Router } from '@angular/router';
import { LucidePencil } from '@lucide/angular';
import {
  compareDates,
  currencySymbol,
  impliedRate,
  LocalDate,
  Money,
  PocketKind,
  toDecimal,
} from '@platin/domain';
import {
  applyKey,
  displayAmount,
  formatRate,
  rateUnit,
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
  PlPocketSelect,
  PlCategorySelect,
  pocketSelectOptions,
  HideAmounts,
  PlBottomSheet,
  PlSheet,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from '../cards/cards.store';
import { CategoriesStore } from '../categories/categories.store';
import { RatesStore } from '../../core/rates.store';
import { PocketFormData, PocketFormSheet } from '../accounts/pocket-form-sheet';
import { showPlanBlock } from '../plans/plan-gate';
import { PlanStore } from '../plans/plan.store';
import { PLANS_TEXTS } from '../plans/plans.texts';
import { TransactionsStore } from '../transactions/transactions.store';
import { QUICK_ENTRY_TEXTS } from './quick-entry.texts';

type Mode = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVEST';
type Direction = 'INVEST' | 'REDEEM';

/**
 * MOV-01/02 in three taps: amount on the keypad, a recent category, save. The account used
 * last is preselected and the date defaults to today. "Invertir" (MOV-07) moves money into an
 * investment pocket, or back from one, as a transfer.
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
    PlPocketSelect,
    PlCategorySelect,
    PlDateField,
    LucidePencil,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet>
      @if (accountsStore.resource.hasValue() && pockets().length === 0) {
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
        <pl-segmented
          [label]="texts.typeLabel"
          [options]="modeOptions()"
          [(value)]="mode"
          (lockedChoose)="showInvestmentsBlock()"
        />

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

        @if (mode() === 'EXPENSE' || mode() === 'INCOME') {
          <!-- Categories -->
          <section class="flex flex-col gap-2">
            <h3 class="text-sm text-muted">{{ texts.categoryRecent }}</h3>
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
            </div>
            <!-- CAT-06: every category, plus "+ Nueva categoría"; what was typed stays. -->
            <pl-category-select
              allowCreate
              [kind]="mode() === 'INCOME' ? 'INCOME' : 'EXPENSE'"
              [label]="texts.categoryAll"
              [placeholder]="texts.categorySearch"
              [categories]="categoriesStore.categories()"
              [recentIds]="categoriesStore.recentIds()"
              [value]="categoryId()"
              (valueChange)="categoryId.set($event)"
            />
          </section>

          <div class="grid grid-cols-[1fr_auto] gap-2">
            <pl-select
              appearance="tile"
              [label]="card() ? texts.card : texts.account"
              [options]="paymentOptions()"
              [value]="paymentValue()"
              (valueChange)="setPayment($event)"
            />
            <!-- MOV-08: incomes and expenses can be scheduled; card purchases can't. -->
            <pl-date-field
              class="min-w-32"
              appearance="tile"
              [label]="texts.date"
              [max]="card() ? today.date() : null"
              [value]="date()"
              (valueChange)="setDate($event)"
            />
          </div>
          @if (scheduled()) {
            <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink" role="status">
              {{ texts.scheduledHint }}
            </p>
          }

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
              <span class="text-sm font-medium">{{ texts.rate(rateUnitText()) }}</span>
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
          @if (mode() === 'TRANSFER') {
            <!-- Transfer -->
            <div class="grid grid-cols-2 gap-2">
              <pl-pocket-select
                appearance="tile"
                display="account"
                [label]="texts.from"
                [pockets]="pockets()"
                [value]="accountId()"
                (valueChange)="accountId.set($event)"
              />
              <pl-pocket-select
                appearance="tile"
                display="account"
                [label]="texts.to"
                placeholder="—"
                [pockets]="pockets()"
                [exclude]="accountId() ? [accountId()!] : []"
                [value]="toAccountId()"
                (valueChange)="toAccountId.set($event)"
              />
            </div>
          } @else {
            <!-- MOV-07: invest or redeem -->
            <pl-segmented
              tone="surface"
              [label]="texts.directionLabel"
              [options]="directionOptions"
              [(value)]="direction"
            />
            <div class="grid grid-cols-2 gap-2">
              @if (direction() === 'INVEST') {
                <pl-pocket-select
                  appearance="tile"
                  display="account"
                  [label]="texts.from"
                  [pockets]="pockets()"
                  [kinds]="investOrigins"
                  [value]="accountId()"
                  (valueChange)="accountId.set($event)"
                />
                <pl-pocket-select
                  appearance="tile"
                  [label]="texts.investment"
                  placeholder="—"
                  [pockets]="pockets()"
                  [kinds]="investmentKinds"
                  [value]="investmentId()"
                  (valueChange)="investmentId.set($event)"
                />
              } @else {
                <pl-pocket-select
                  appearance="tile"
                  [label]="texts.investment"
                  placeholder="—"
                  [pockets]="pockets()"
                  [kinds]="investmentKinds"
                  [value]="investmentId()"
                  (valueChange)="investmentId.set($event)"
                />
                <pl-pocket-select
                  appearance="tile"
                  display="account"
                  [label]="texts.to"
                  [pockets]="pockets()"
                  [kinds]="redeemDestinations"
                  [value]="accountId()"
                  (valueChange)="accountId.set($event)"
                />
              }
            </div>
            @if (!hasInvestments()) {
              <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink">
                {{ texts.noInvestments }}
              </p>
            }
            @if (direction() === 'INVEST') {
              <button plButton="secondary" type="button" (click)="newInvestment()">
                {{ texts.newInvestment }}
              </button>
            }
          }
          @if (crossCurrency()) {
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">
                {{ texts.received }} ({{ toPocket()?.currency }})
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
            {{
              saving()
                ? texts.saving
                : scheduled()
                  ? texts.schedule
                  : texts.save[mode() === 'INVEST' ? direction() : mode()]
            }}
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
  protected readonly categoriesStore = inject(CategoriesStore);
  private readonly cardsStore = inject(CardsStore);
  private readonly ratesStore = inject(RatesStore);
  private readonly transactions = inject(TransactionsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly hideAmounts = inject(HideAmounts);
  private readonly planStore = inject(PlanStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly injector = inject(Injector);

  /** "Invertir" needs the plan that includes investments (PLN-07). */
  protected readonly modeOptions = computed<PlSegmentOption<Mode>[]>(() => {
    const block = this.planStore.block('investments');
    return (['EXPENSE', 'INCOME', 'TRANSFER', 'INVEST'] as const).map((value) => ({
      value,
      label: QUICK_ENTRY_TEXTS.types[value],
      ...(value === 'INVEST' && block
        ? {
            locked: true,
            badge: block.upgrade,
            lockedLabel: PLANS_TEXTS.gate.locked(block.upgrade),
          }
        : {}),
    }));
  });
  protected readonly directionOptions: PlSegmentOption<Direction>[] = (
    ['INVEST', 'REDEEM'] as const
  ).map((value) => ({ value, label: QUICK_ENTRY_TEXTS.directions[value] }));
  protected readonly investOrigins: PocketKind[] = ['AVAILABLE', 'SAVINGS'];
  protected readonly investmentKinds: PocketKind[] = ['INVESTMENT'];
  protected readonly redeemDestinations: PocketKind[] = ['AVAILABLE'];

  protected readonly mode = signal<Mode>('EXPENSE');
  protected readonly direction = signal<Direction>('INVEST');
  /** The investment pocket of "Invertir": destination when investing, origin when redeeming. */
  protected readonly investmentId = signal<string | null>(null);
  protected readonly amount = signal('');
  protected readonly accountId = signal<string | null>(null);
  protected readonly toAccountId = signal<string | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly note = signal('');
  protected readonly showNote = signal(false);
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
  /** Pockets grouped by account and, for an expense, the cards (value "card:<id>"). */
  protected readonly paymentOptions = computed<PlSelectOption[]>(() => [
    ...pocketSelectOptions(this.pockets(), this.hideAmounts.hidden(), 'account'),
    ...(this.mode() === 'EXPENSE'
      ? this.cards().map((card) => ({
          value: `card:${card.id}`,
          label: card.name,
          tone: 'card' as const,
          group: this.texts.cardsGroup,
        }))
      : []),
  ]);

  protected readonly pockets = computed(() => this.accountsStore.pockets());
  /** The pocket the money leaves (or enters, for an income). */
  protected readonly account = computed(() => this.accountsStore.pocketById(this.accountId()));
  protected readonly toAccount = computed(() => this.accountsStore.pocketById(this.toAccountId()));
  protected readonly investment = computed(() =>
    this.accountsStore.pocketById(this.investmentId()),
  );
  protected readonly hasInvestments = computed(() =>
    this.pockets().some((p) => p.kind === 'INVESTMENT'),
  );
  /** Where the money leaves and enters, for a transfer or an investment. */
  protected readonly fromPocket = computed(() =>
    this.mode() === 'INVEST' && this.direction() === 'REDEEM' ? this.investment() : this.account(),
  );
  protected readonly toPocket = computed(() => {
    if (this.mode() === 'TRANSFER') return this.toAccount();
    if (this.mode() !== 'INVEST') return undefined;
    return this.direction() === 'INVEST' ? this.investment() : this.account();
  });
  protected readonly amountCurrency = computed(() =>
    this.card() ? this.cardCurrency() : (this.fromPocket()?.currency ?? 'ARS'),
  );
  protected readonly symbol = computed(() => currencySymbol(this.amountCurrency()));
  private readonly base = computed(() => this.auth.user()?.baseCurrency ?? 'ARS');
  protected readonly rateUnitText = computed(() => rateUnit(this.amountCurrency(), this.base()));
  protected readonly amountText = computed(() => displayAmount(this.amount()));
  /** MOV-08: an income or expense with a date after today is scheduled. */
  protected readonly scheduled = computed(
    () =>
      (this.mode() === 'EXPENSE' || this.mode() === 'INCOME') &&
      !this.card() &&
      compareDates(this.date(), this.today.date()) > 0,
  );

  protected readonly visibleCategories = computed(() => {
    const mode = this.mode();
    if (mode === 'TRANSFER' || mode === 'INVEST') return [];
    const all = this.categoriesStore.ofKind(mode);
    const recent = this.categoriesStore.recent(mode);
    const selected = all.find((c) => c.id === this.categoryId());
    return selected && !recent.includes(selected) ? [selected, ...recent.slice(0, 4)] : recent;
  });

  protected readonly needsRate = computed(() => {
    const base = this.auth.user()?.baseCurrency ?? 'ARS';
    return (
      (this.mode() === 'EXPENSE' || this.mode() === 'INCOME') &&
      !this.card() &&
      !!this.account() &&
      this.amountCurrency() !== base
    );
  });
  protected readonly rateHint = computed(() => {
    const currency = this.amountCurrency();
    const base = this.base();
    // The dollar names its type (oficial, MEP, blue); the other currencies use the oficial one.
    if (currency === 'USD' || (currency === 'ARS' && base === 'USD')) {
      const rate = this.ratesStore.preferred();
      if (!rate) return this.texts.rateHintNoRate;
      return this.texts.rateHint(
        rate.type,
        displayAmount(toDecimal(rate.sell).toFixed(2).replace(/\.00$/, '')),
      );
    }
    const rate = this.ratesStore.rateFor(currency, base);
    return rate
      ? this.texts.rateHintOf(formatRate(currency, base, rate))
      : this.texts.rateHintNoRate;
  });
  protected readonly crossCurrency = computed(
    () => !!this.toPocket() && this.toPocket()?.currency !== this.fromPocket()?.currency,
  );
  protected readonly rateLabel = computed(() => {
    const received = parseTypedAmount(this.receivedText());
    const from = this.fromPocket();
    const to = this.toPocket();
    if (!received || !from || !to || !isValidAmount(this.amount())) return null;
    const rate = impliedRate(
      Money.of(this.amount(), from.currency),
      Money.of(received, to.currency),
    );
    return rate ? formatRate(from.currency, to.currency, rate) : null;
  });

  constructor() {
    // Preselect the last used pocket (or the first "Disponible") once accounts load.
    effect(() => {
      const pockets = this.pockets();
      if (this.accountId() || pockets.length === 0) return;
      const last = this.accountsStore.lastUsedId();
      const fallback = pockets.find((p) => p.kind === 'AVAILABLE') ?? pockets[0];
      this.accountId.set(pockets.find((p) => p.id === last)?.id ?? fallback.id);
    });
    // Changing the type resets the category (income and expense categories differ).
    effect(() => {
      this.mode();
      this.categoryId.set(null);
      this.error.set(null);
    });
    // Only incomes and expenses are scheduled: anything else goes back to today at most.
    effect(() => {
      const canSchedule = (this.mode() === 'EXPENSE' || this.mode() === 'INCOME') && !this.card();
      const today = this.today.date();
      if (
        !canSchedule &&
        compareDates(
          untracked(() => this.date()),
          today,
        ) > 0
      ) {
        this.date.set(today);
      }
    });
    // Investing starts from a "Disponible" (of the account used last) and redeems back to one.
    effect(() => {
      if (this.mode() !== 'INVEST') return;
      const allowed = this.direction() === 'INVEST' ? this.investOrigins : this.redeemDestinations;
      const pockets = this.pockets();
      const current = untracked(() => this.account());
      if (current && allowed.includes(current.kind)) return;
      const available = pockets.filter((p) => p.kind === 'AVAILABLE');
      const choice =
        available.find((p) => p.accountId === current?.accountId) ??
        available.find((p) => p.currency === current?.currency) ??
        available[0];
      if (choice) this.accountId.set(choice.id);
    });
    // The investment defaults to the first one of the account (or any).
    effect(() => {
      if (this.mode() !== 'INVEST' || this.investmentId()) return;
      const investments = this.pockets().filter((p) => p.kind === 'INVESTMENT');
      const accountId = untracked(() => this.account()?.accountId);
      const choice = investments.find((p) => p.accountId === accountId) ?? investments[0];
      if (choice) this.investmentId.set(choice.id);
    });
  }

  protected showInvestmentsBlock(): void {
    const block = this.planStore.block('investments');
    if (block) showPlanBlock(this.injector, block);
  }

  /** "+ Nueva inversión": the pocket form on top; back here with the new one chosen. */
  protected newInvestment(): void {
    const block = this.planStore.block(['investments', 'pockets']);
    if (block) return showPlanBlock(this.injector, block);
    const ref = this.sheet.open<PocketFormSheet, PocketFormData, Pocket>(PocketFormSheet, {
      data: { kind: 'INVESTMENT' } satisfies PocketFormData,
      ariaLabel: this.texts.newInvestment,
    });
    ref.closed.subscribe((pocket) => {
      if (pocket) this.investmentId.set(pocket.id);
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
      if (this.mode() === 'TRANSFER' || this.mode() === 'INVEST') {
        await this.transactions.transfer({
          fromPocketId: this.fromPocket()?.id as string,
          toPocketId: this.toPocket()?.id as string,
          amountOut: this.amount(),
          amountIn: this.crossCurrency() ? parseTypedAmount(this.receivedText()) : undefined,
          date: this.date(),
          description,
          ...(this.mode() === 'INVEST' ? { intent: this.direction() } : {}),
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
          pocketId: accountId,
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
    if (this.mode() === 'INVEST') {
      if (!this.investment()) return errors.investment;
      if (this.crossCurrency() && !parseTypedAmount(this.receivedText())) return errors.received;
      return null;
    }
    if (!this.categoryId()) return errors.category;
    return null;
  }
}
