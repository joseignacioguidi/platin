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
import { AMBIGUOUS_DATE_TEXTS } from '@platin/contracts';
import { LucideKeyboard, LucideType } from '@lucide/angular';
import {
  compareDates,
  currencySymbol,
  dateParts,
  type TextEntryDraft,
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
  PlInstallmentsPicker,
  PlSegmented,
  PlDateField,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
  PlPocketSelect,
  PlCategorySelect,
  accountSelectOptions,
  PlAccountSelect,
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
import { TextEntryStore } from './text-entry.store';

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
    PlInstallmentsPicker,
    PlAmountKeypad,
    PlEmptyState,
    PlSelect,
    PlPocketSelect,
    PlAccountSelect,
    PlCategorySelect,
    PlDateField,
    LucideKeyboard,
    LucideType,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet compact>
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

        <!-- Amount, with the currency next to it -->
        <div class="flex min-h-11 items-center justify-center gap-2">
          <p
            class="font-amount flex items-center text-[40px] leading-none font-semibold tracking-tight"
            [attr.aria-label]="texts.amountLabel + ': ' + amountText()"
            aria-live="polite"
          >
            <span>{{ symbol() }}&nbsp;{{ amountText() }}</span>
            <span class="ml-1 h-9 w-1 animate-pulse rounded bg-brand" aria-hidden="true"></span>
          </p>
          @if (card()) {
            <button
              type="button"
              class="font-amount min-h-11 rounded-full border border-line px-3 text-sm"
              [attr.aria-label]="texts.currencyToggle(amountCurrency())"
              (click)="cardCurrency.set(cardCurrency() === 'ARS' ? 'USD' : 'ARS')"
            >
              {{ amountCurrency() }} ⇄
            </button>
          } @else {
            <span class="font-amount rounded-full border border-line px-2.5 py-1 text-sm">
              {{ amountCurrency() }}
            </span>
          }
          @if (mode() === 'EXPENSE' || mode() === 'INCOME') {
            <!-- TXT-01: switches between the keypad and a line of text. -->
            <button
              type="button"
              class="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-ink hover:bg-field focus-visible:outline-2 focus-visible:outline-brand"
              [attr.aria-label]="writing() ? texts.useKeypad : texts.write"
              [attr.aria-pressed]="writing()"
              (click)="toggleWriting()"
            >
              @if (writing()) {
                <svg lucideKeyboard [size]="20" aria-hidden="true"></svg>
              } @else {
                <svg lucideType [size]="20" aria-hidden="true"></svg>
              }
            </button>
          }
        </div>

        <!-- MOV-09: the reason, always visible; empty, it takes the category's name. -->
        <input
          type="text"
          maxlength="120"
          class="min-h-11 rounded-2xl border border-line bg-surface px-4 text-center text-[15px]"
          [attr.aria-label]="texts.note"
          [placeholder]="texts.notePlaceholder"
          [value]="note()"
          (input)="note.set(inputValue($event))"
        />

        @if (mode() === 'EXPENSE' || mode() === 'INCOME') {
          <!-- MOV-09 (iteration 7): the same category picker as the other forms. -->
          <pl-category-select
            class="shrink-0"
            allowCreate
            [kind]="mode() === 'INCOME' ? 'INCOME' : 'EXPENSE'"
            [label]="texts.category"
            [categories]="categoriesStore.categories()"
            [recentIds]="categoriesStore.recentIds()"
            [value]="categoryId()"
            (valueChange)="categoryId.set($event)"
          />

          <div [class]="row">
            <pl-select
              class="shrink-0"
              appearance="chip"
              [label]="card() ? texts.card : texts.account"
              [options]="paymentOptions()"
              [value]="paymentValue()"
              (valueChange)="setPayment($event)"
            />
            <!-- MOV-08: incomes and expenses can be scheduled; card purchases can't. -->
            <pl-date-field
              class="shrink-0"
              appearance="chip"
              [label]="texts.date"
              [max]="card() ? today.date() : null"
              [value]="date()"
              (valueChange)="setDate($event)"
            />
          </div>
          @if (scheduled()) {
            <p class="text-center text-xs text-pending-ink" role="status">
              {{ texts.scheduledHint }}
            </p>
          }

          @if (card(); as card) {
            <!-- TAR-02: the two most used counts and "Otra"; a written "5c" shows as the third. -->
            <pl-installments-picker [top]="card.topInstallments" [(value)]="installments" />
          }

          @if (needsRate()) {
            <input
              type="text"
              inputmode="decimal"
              class="font-amount min-h-11 rounded-2xl border border-line bg-surface px-4 text-[15px]"
              [attr.aria-label]="texts.rate(rateUnitText()) + '. ' + rateHint()"
              [placeholder]="texts.rate(rateUnitText())"
              [value]="rateText()"
              (input)="rateText.set(inputValue($event))"
            />
          }
        } @else {
          @if (mode() === 'TRANSFER') {
            <div class="grid grid-cols-2 gap-2">
              <pl-account-select
                appearance="tile"
                [label]="texts.from"
                [pockets]="pockets()"
                [value]="accountId()"
                (valueChange)="accountId.set($event)"
              />
              <pl-account-select
                appearance="tile"
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
                <pl-account-select
                  appearance="tile"
                  [label]="texts.from"
                  [pockets]="pockets()"
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
                <pl-account-select
                  appearance="tile"
                  [label]="texts.to"
                  [pockets]="pockets()"
                  [value]="accountId()"
                  (valueChange)="accountId.set($event)"
                />
              }
            </div>
            @if (!hasInvestments()) {
              <p class="text-center text-xs text-pending-ink">{{ texts.noInvestments }}</p>
            }
          }
          <!-- Date, the amount received between currencies and "+ Nueva inversión", in one row. -->
          <div [class]="row">
            <pl-date-field
              class="shrink-0"
              appearance="chip"
              [label]="texts.date"
              [max]="today.date()"
              [value]="date()"
              (valueChange)="setDate($event)"
            />
            @if (crossCurrency()) {
              <input
                type="text"
                inputmode="decimal"
                class="font-amount min-h-11 min-w-36 flex-1 rounded-full border border-line bg-surface px-4 text-[15px]"
                [attr.aria-label]="texts.received + ' (' + toPocket()?.currency + ')'"
                [placeholder]="texts.received + ' (' + toPocket()?.currency + ')'"
                [value]="receivedText()"
                (input)="receivedText.set(inputValue($event))"
              />
            }
            @if (mode() === 'INVEST' && direction() === 'INVEST') {
              <button plChip type="button" (click)="newInvestment()">
                {{ texts.newInvestment }}
              </button>
            }
          </div>
          @if (crossCurrency() && rateLabel()) {
            <p class="font-amount text-center text-xs text-muted">{{ rateLabel() }}</p>
          }
        }

        @if (writing() && (mode() === 'EXPENSE' || mode() === 'INCOME')) {
          <div class="flex shrink-0 flex-col gap-2">
            <div class="flex gap-2">
              <input
                type="text"
                enterkeyhint="done"
                autocomplete="off"
                maxlength="200"
                class="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-[15px]"
                [attr.aria-label]="texts.writeLabel"
                aria-describedby="write-hint"
                [placeholder]="texts.writePlaceholder"
                [value]="text()"
                (input)="text.set(inputValue($event))"
                (keydown.enter)="$event.preventDefault(); interpret()"
              />
              <button plButton type="button" class="min-h-12!" (click)="interpret()">
                {{ texts.interpret }}
              </button>
            </div>
            @if (ambiguous(); as options) {
              <div
                role="group"
                [attr.aria-label]="texts.ambiguousLabel"
                class="flex flex-col gap-2"
              >
                <p class="text-center text-sm font-medium">{{ ambiguousQuestion() }}</p>
                <div class="grid grid-cols-2 gap-2">
                  <button plButton="secondary" type="button" (click)="chooseOption(options[0])">
                    {{ dateOption(options[0], false) }}
                  </button>
                  <button plButton="secondary" type="button" (click)="chooseOption(options[1])">
                    {{ dateOption(options[1], true) }}
                  </button>
                </div>
              </div>
            } @else if (understood()) {
              <p id="write-hint" class="text-center text-xs text-brand-strong" role="status">
                {{ texts.understood }}
              </p>
            } @else {
              <p id="write-hint" class="text-center text-xs text-muted">{{ texts.writeHint }}</p>
            }
          </div>
        } @else {
          <pl-amount-keypad [(value)]="amount" />
        }

        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-2 text-sm" role="alert">{{ error() }}</p>
        }

        <button
          plButton
          size="lg"
          type="button"
          class="min-h-12! flex-none!"
          [disabled]="saving()"
          (click)="save()"
        >
          {{
            saving()
              ? texts.saving
              : scheduled()
                ? texts.schedule
                : texts.save[mode() === 'INVEST' ? direction() : mode()]
          }}
        </button>
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
  private readonly textEntry = inject(TextEntryStore);

  /** TXT-01: "Escribir" replaces the keypad with a line of text. */
  protected readonly writing = signal(false);
  protected readonly text = signal('');
  protected readonly understood = signal(false);
  /** The two drafts of AMBIGUOUS_DATE, until one is chosen. */
  protected readonly ambiguous = signal<[TextEntryDraft, TextEntryDraft] | null>(null);
  protected readonly ambiguousQuestion = computed(() => {
    const options = this.ambiguous();
    return options ? AMBIGUOUS_DATE_TEXTS.question(dateParts(options[1].date).day) : '';
  });
  /** The category a draft brings, applied after the type change resets it. */
  private nextCategory: string | null = null;

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
  protected readonly investmentKinds: PocketKind[] = ['INVESTMENT'];

  protected readonly mode = signal<Mode>('EXPENSE');
  protected readonly direction = signal<Direction>('INVEST');
  /** The investment pocket of "Invertir": destination when investing, origin when redeeming. */
  protected readonly investmentId = signal<string | null>(null);
  protected readonly amount = signal('');
  protected readonly accountId = signal<string | null>(null);
  protected readonly toAccountId = signal<string | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly date = signal<LocalDate>(this.today.date());
  /** MOV-09: "¿En qué?"; empty, the movement takes the category's name. */
  protected readonly note = signal('');
  /** A row of chips that scrolls sideways, edge to edge of the sheet. */
  protected readonly row =
    '-mx-5 flex shrink-0 items-center gap-2 overflow-x-auto px-5 [scrollbar-width:none]';
  protected readonly receivedText = signal('');
  protected readonly rateText = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Paying with a card (expenses only): the purchase goes to the card's statements. */
  protected readonly cardId = signal<string | null>(null);
  protected readonly cardCurrency = signal<'ARS' | 'USD'>('ARS');
  protected readonly installments = signal(1);

  protected readonly cards = computed(() => this.cardsStore.cards().filter((c) => !c.archived));
  protected readonly card = computed(() =>
    this.mode() === 'EXPENSE' ? this.cardsStore.byId(this.cardId()) : undefined,
  );
  protected readonly paymentValue = computed(() =>
    this.card() ? `card:${this.cardId()}` : this.accountId(),
  );
  /** The accounts (never a reserve) and, for an expense, the cards (value "card:<id>"). */
  protected readonly paymentOptions = computed<PlSelectOption[]>(() => [
    ...accountSelectOptions(this.pockets(), this.hideAmounts.hidden()),
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
    // Preselect the last used account (or the first one) once accounts load.
    effect(() => {
      const balances = this.pockets().filter((p) => p.kind === 'AVAILABLE');
      if (this.accountId() || balances.length === 0) return;
      const last = this.accountsStore.lastUsedId();
      this.accountId.set(balances.find((p) => p.id === last)?.id ?? balances[0].id);
    });
    // Changing the type resets the category (income and expense categories differ), unless a
    // written text brought one.
    effect(() => {
      this.mode();
      this.categoryId.set(this.nextCategory);
      this.nextCategory = null;
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
    // Investing starts from an account balance (the one used last) and redeems back to one.
    effect(() => {
      if (this.mode() !== 'INVEST') return;
      this.direction();
      const pockets = this.pockets();
      const current = untracked(() => this.account());
      if (current?.kind === 'AVAILABLE') return;
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

  protected toggleWriting(): void {
    this.writing.update((writing) => !writing);
    this.ambiguous.set(null);
    this.understood.set(false);
    if (this.writing()) {
      // Focus the new field once it is rendered.
      setTimeout(() =>
        this.host.nativeElement.querySelector<HTMLInputElement>('input[enterkeyhint]')?.focus(),
      );
    }
  }

  /** Enter or "Listo": the parser fills the form; nothing is saved until "Guardar". */
  protected interpret(): void {
    this.ambiguous.set(null);
    this.understood.set(false);
    if (!this.text().trim()) return;
    const result = this.textEntry.interpret(this.text(), this.account()?.accountId ?? null);
    if (result.ok) {
      this.applyDraft(result.draft, result.pocketId);
    } else if ('ambiguous' in result) {
      // Everything but the date is known: fill it and ask only for the date.
      const first = this.textEntry.check(result.ambiguous[0], this.account()?.accountId ?? null);
      if (!first.ok) {
        this.error.set('message' in first ? first.message : null);
        return;
      }
      this.applyDraft(first.draft, first.pocketId);
      this.understood.set(false);
      this.ambiguous.set(result.ambiguous);
    } else {
      this.error.set(result.message);
    }
  }

  protected chooseOption(draft: TextEntryDraft): void {
    this.ambiguous.set(null);
    const result = this.textEntry.check(draft, this.account()?.accountId ?? null);
    if (result.ok) this.applyDraft(result.draft, result.pocketId);
    else if ('message' in result) this.error.set(result.message);
  }

  /** "20/10 · ya pasó" or "20/11 · programar". */
  protected dateOption(draft: TextEntryDraft, future: boolean): string {
    const { day, month } = dateParts(draft.date);
    const label = `${day}/${month}`;
    return future ? AMBIGUOUS_DATE_TEXTS.future(label) : AMBIGUOUS_DATE_TEXTS.past(label);
  }

  private applyDraft(draft: TextEntryDraft, pocketId: string | null): void {
    if (this.mode() === draft.type) {
      this.categoryId.set(draft.categoryId);
    } else {
      this.nextCategory = draft.categoryId;
      this.mode.set(draft.type);
    }
    if (draft.source?.kind === 'CARD') {
      this.cardId.set(draft.source.id);
      this.cardCurrency.set(draft.currency === 'USD' ? 'USD' : 'ARS');
      this.installments.set(draft.installments);
    } else {
      this.cardId.set(null);
      this.installments.set(1);
      if (pocketId) this.accountId.set(pocketId);
    }
    this.amount.set(draft.amount.replace(/\.00$/, ''));
    this.date.set(draft.date);
    this.note.set(draft.description);
    this.error.set(null);
    this.understood.set(true);
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
    const categoryName = this.categoriesStore.byId(this.categoryId() ?? '')?.name;
    // MOV-09: without a reason, incomes and expenses take the category's name.
    const description =
      this.note().trim() ||
      (this.mode() === 'EXPENSE' || this.mode() === 'INCOME' ? categoryName : undefined);
    try {
      if (this.mode() === 'TRANSFER' || this.mode() === 'INVEST') {
        await this.transactions.transfer({
          fromPocketId: this.fromPocket()?.id as string,
          toPocketId: this.toPocket()?.id as string,
          amountOut: this.amount(),
          amountIn: this.crossCurrency() ? parseTypedAmount(this.receivedText()) : undefined,
          date: this.date(),
          description,
        });
      } else if (this.card()) {
        const categoryId = this.categoryId() as string;
        await this.cardsStore.createCharge(this.cardId() as string, {
          description: description ?? '—',
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
