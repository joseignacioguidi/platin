import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideCheck, LucideChevronRight, LucidePencil, LucideX } from '@lucide/angular';
import type { Account } from '@platin/contracts';
import { CURRENCIES, type Currency } from '@platin/domain';
import {
  parseTypedAmount,
  PL_CURRENCY_NAMES,
  PlBottomSheet,
  PlChip,
  PlMoney,
  PlSelect,
  type PlSelectOption,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { AccountFormSheet } from '../accounts/account-form-sheet';
import { AccountsStore } from '../accounts/accounts.store';
import { PocketFormSheet, type PocketFormData } from '../accounts/pocket-form-sheet';
import { OnboardingStore } from './onboarding.store';
import { ONBOARDING_TEXTS } from './onboarding.texts';
import { FOOT_PRIMARY, FOOT_SECONDARY, OnboardingShell } from './onboarding-shell';
import { ACCOUNT_PRESETS, ONBOARDING_PATHS } from './onboarding-steps';
import { AMOUNT_BOX, AMOUNT_INPUT, sameName } from './onboarding-ui';

interface ExtraBalance {
  account: string;
  currency: Currency;
  amount: string;
}

/** Step 1 (AUTH-05): the accounts with today's balance; Efectivo comes chosen. */
@Component({
  selector: 'pl-onboarding-accounts',
  imports: [
    OnboardingShell,
    PlChip,
    PlMoney,
    PlSelect,
    LucideCheck,
    LucideChevronRight,
    LucidePencil,
    LucideX,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-onboarding-shell [step]="1" [canGoBack]="false" [heading]="t.title" [body]="t.body">
      <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t.chipsLabel">
        @for (preset of presets; track preset.name) {
          @let created = isCreated(preset.name);
          @let chosen = created || selected().includes(preset.name);
          <button
            plChip
            tone="ink"
            [selected]="chosen"
            [disabled]="created || (!chosen && atLimit())"
            (click)="toggle(preset.name)"
          >
            @if (chosen) {
              <svg lucideCheck [size]="16" aria-hidden="true"></svg>
            }
            {{ preset.name }}
          </button>
        }
        <button
          plChip
          tone="ink"
          [selected]="otherChosen()"
          [disabled]="!otherChosen() && atLimit()"
          (click)="otherChosen.set(!otherChosen())"
        >
          @if (otherChosen()) {
            <svg lucideCheck [size]="16" aria-hidden="true"></svg>
          }
          {{ t.other }}
        </button>
      </div>
      @if (limitText()) {
        <p class="text-sm text-muted">{{ limitText() }}</p>
      }

      @if (existing().length > 0 || rows().length > 0 || otherChosen()) {
        <section class="flex flex-col rounded-tile bg-surface px-4 pb-2 pt-1">
          <p class="mb-2 mt-3 text-[13px] font-bold uppercase text-muted">{{ t.todayBalance }}</p>
          @for (account of existing(); track account.id) {
            <div class="flex min-h-[72px] items-center gap-3 border-t border-line py-3">
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-base font-bold">{{ account.name }}</span>
                <span class="text-xs text-muted">{{ t.created }}</span>
              </span>
              <pl-money [amount]="balanceOf(account)" class="text-base" />
              <button
                type="button"
                class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field"
                [attr.aria-label]="t.edit(account.name)"
                (click)="edit(account)"
              >
                <svg lucidePencil [size]="18" aria-hidden="true"></svg>
              </button>
            </div>
          }
          @for (name of rows(); track name) {
            <div class="flex items-center gap-3 border-t border-line py-3">
              <span class="min-w-0 flex-1 truncate text-base font-bold">{{ name }}</span>
              <span [class]="amountBox + ' basis-[170px]'">
                <span class="font-amount text-muted" aria-hidden="true">$</span>
                <input
                  type="text"
                  inputmode="decimal"
                  [class]="amountInput"
                  [attr.aria-label]="t.balanceOf(name)"
                  [value]="balances()[name] ?? ''"
                  placeholder="0"
                  (input)="setBalance(name, value($event))"
                />
              </span>
            </div>
          }
          @if (otherChosen()) {
            <div class="flex flex-wrap items-center gap-3 border-t border-line py-3">
              <input
                type="text"
                maxlength="60"
                class="min-h-12 min-w-0 flex-1 rounded-[14px] bg-field px-3.5 text-base font-bold placeholder:font-normal placeholder:text-muted focus:outline-2 focus:outline-brand"
                [attr.aria-label]="t.otherName"
                [placeholder]="t.otherPlaceholder"
                [value]="otherName()"
                (input)="otherName.set(value($event))"
              />
              <span [class]="amountBox + ' basis-[170px]'">
                <span class="font-amount text-muted" aria-hidden="true">$</span>
                <input
                  type="text"
                  inputmode="decimal"
                  [class]="amountInput"
                  [attr.aria-label]="t.balanceOf(otherName() || t.other)"
                  placeholder="0"
                  [value]="otherBalance()"
                  (input)="otherBalance.set(value($event))"
                />
              </span>
            </div>
          }

          @for (extra of extras(); track $index) {
            <div class="flex min-h-12 items-center gap-3 border-t border-line py-2 text-[15px]">
              <span class="min-w-0 flex-1 truncate">{{ extra.account }}</span>
              <pl-money [amount]="extra.amount" [currency]="extra.currency" />
              <button
                type="button"
                class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field"
                [attr.aria-label]="t.removeOtherCurrency(extra.account + ' ' + extra.currency)"
                (click)="removeExtra($index)"
              >
                <svg lucideX [size]="18" aria-hidden="true"></svg>
              </button>
            </div>
          }

          @if (addingExtra()) {
            <div class="flex flex-col gap-3 border-t border-line py-3">
              <p class="text-sm font-semibold">{{ t.otherCurrencyTitle }}</p>
              <div class="grid grid-cols-2 gap-2">
                <pl-select
                  [label]="t.otherCurrencyAccount"
                  [options]="extraAccountOptions()"
                  [value]="extraAccount()"
                  (valueChange)="extraAccount.set($event)"
                />
                <pl-select
                  [label]="t.otherCurrencyCurrency"
                  [options]="currencyOptions"
                  [value]="extraCurrency()"
                  (valueChange)="extraCurrency.set($event ?? 'USD')"
                />
              </div>
              <span [class]="amountBox">
                <span class="font-amount text-muted" aria-hidden="true">{{ extraCurrency() }}</span>
                <input
                  type="text"
                  inputmode="decimal"
                  [class]="amountInput"
                  [attr.aria-label]="t.otherCurrencyAmount(extraCurrency())"
                  placeholder="0"
                  [value]="extraAmount()"
                  (input)="extraAmount.set(value($event))"
                />
              </span>
              <button
                type="button"
                class="min-h-11 self-start rounded-full bg-field px-4 text-sm font-semibold"
                (click)="addExtra()"
              >
                {{ t.otherCurrencyAdd }}
              </button>
            </div>
          } @else {
            <button
              type="button"
              class="min-h-11 self-start text-sm font-semibold text-brand-strong"
              (click)="addingExtra.set(true)"
            >
              {{ t.otherCurrency }}
            </button>
          }
        </section>
      }

      <button
        type="button"
        class="flex min-h-14 items-center gap-3 rounded-[18px] border-[1.5px] border-line bg-surface px-4 text-left hover:bg-field"
        [disabled]="saving()"
        (click)="addReserve()"
      >
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-bold">{{ t.reserves }}</span>
          <span class="text-[13px] text-muted">{{ t.reservesBody }}</span>
        </span>
        <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
      </button>

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      <ng-container footer>
        <button type="button" [class]="primary" [disabled]="saving()" (click)="next()">
          {{ saving() ? texts.saving : texts.next }}
        </button>
        <button type="button" [class]="secondary" [disabled]="saving()" (click)="skip()">
          {{ texts.skip }}
        </button>
      </ng-container>
    </pl-onboarding-shell>
  `,
})
export class AccountsStep {
  protected readonly texts = ONBOARDING_TEXTS;
  protected readonly t = ONBOARDING_TEXTS.accounts;
  protected readonly presets = ACCOUNT_PRESETS;
  protected readonly primary = FOOT_PRIMARY;
  protected readonly secondary = FOOT_SECONDARY;
  protected readonly amountBox = AMOUNT_BOX;
  protected readonly amountInput = AMOUNT_INPUT;
  protected readonly currencyOptions: PlSelectOption<Currency>[] = CURRENCIES.filter(
    (c) => c !== 'ARS',
  ).map((c) => ({ value: c, label: PL_CURRENCY_NAMES[c], hint: c }));

  private readonly accounts = inject(AccountsStore);
  private readonly onboarding = inject(OnboardingStore);
  private readonly auth = inject(AuthService);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);

  protected readonly existing = computed(() => this.accounts.accounts());
  /** Efectivo comes chosen for an account with nothing yet. */
  protected readonly selected = signal<string[]>(
    this.onboarding.state()?.steps.accounts === 'PENDING' ? ['Efectivo'] : [],
  );
  protected readonly balances = signal<Record<string, string>>({});
  protected readonly otherChosen = signal(false);
  protected readonly otherName = signal('');
  protected readonly otherBalance = signal('');
  protected readonly extras = signal<ExtraBalance[]>([]);
  protected readonly addingExtra = signal(false);
  protected readonly extraAccount = signal<string | null>(null);
  protected readonly extraCurrency = signal<Currency>('USD');
  protected readonly extraAmount = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Chosen presets not created yet, in the chips' order. */
  protected readonly rows = computed(() =>
    this.presets
      .map((preset) => preset.name)
      .filter((name) => this.selected().includes(name) && !this.isCreated(name)),
  );

  private readonly limit = computed(() => this.onboarding.state()?.limits.accounts.max ?? null);
  private readonly planned = computed(
    () => this.existing().length + this.rows().length + (this.otherChosen() ? 1 : 0),
  );
  protected readonly atLimit = computed(() => {
    const max = this.limit();
    return max !== null && this.planned() >= max;
  });
  protected readonly limitText = computed(() => {
    const max = this.limit();
    return max === null ? null : this.texts.planLimit(max, this.t.plural);
  });

  protected readonly extraAccountOptions = computed<PlSelectOption<string>[]>(() =>
    [
      ...this.existing().map((account) => account.name),
      ...this.rows(),
      ...(this.otherChosen() && this.otherName().trim() ? [this.otherName().trim()] : []),
    ].map((name) => ({ value: name, label: name })),
  );

  protected isCreated(name: string): boolean {
    return this.existing().some((account) => sameName(account.name, name));
  }

  protected balanceOf(account: Account): string {
    const pocket = account.pockets.find((p) => p.kind === 'AVAILABLE' && p.currency === 'ARS');
    return pocket?.balance ?? '0';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected toggle(name: string): void {
    if (this.isCreated(name)) return;
    this.selected.update((list) =>
      list.includes(name) ? list.filter((n) => n !== name) : [...list, name],
    );
  }

  protected setBalance(name: string, value: string): void {
    this.balances.update((all) => ({ ...all, [name]: value }));
  }

  protected addExtra(): void {
    this.error.set(null);
    const account = this.extraAccount() ?? this.extraAccountOptions()[0]?.value;
    if (!account) return this.error.set(this.t.errors.needAccount);
    const amount = parseTypedAmount(this.extraAmount());
    if (amount === undefined) return this.error.set(this.t.errors.balance(account));
    this.extras.update((list) => [...list, { account, currency: this.extraCurrency(), amount }]);
    this.extraAmount.set('');
    this.addingExtra.set(false);
  }

  protected removeExtra(index: number): void {
    this.extras.update((list) => list.filter((_, i) => i !== index));
  }

  protected edit(account: Account): void {
    this.sheet.open(AccountFormSheet, { data: account, ariaLabel: this.t.edit(account.name) });
  }

  /** The reserves need an account: what is chosen is created first. */
  protected async addReserve(): Promise<void> {
    if (!(await this.save())) return;
    if (this.existing().length === 0) return this.error.set(this.t.errors.needAccount);
    this.sheet.open(PocketFormSheet, {
      data: { kind: 'SPENDING' } satisfies PocketFormData,
      ariaLabel: this.t.reservesLabel,
    });
  }

  protected async next(): Promise<void> {
    if (!(await this.save())) return;
    await this.finish('DONE');
  }

  protected async skip(): Promise<void> {
    await this.finish('SKIPPED');
  }

  private async finish(status: 'DONE' | 'SKIPPED'): Promise<void> {
    this.saving.set(true);
    try {
      await this.onboarding.mark('accounts', status);
      await this.router.navigateByUrl(ONBOARDING_PATHS.cards);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Creates the chosen accounts and the balances in other currencies. Each one saves at once. */
  private async save(): Promise<boolean> {
    this.error.set(null);
    const toCreate: { name: string; kind: Account['kind']; initialBalance: string }[] = [];
    for (const name of this.rows()) {
      const typed = this.balances()[name]?.trim() ?? '';
      const initialBalance = typed ? parseTypedAmount(typed) : '0';
      if (initialBalance === undefined) {
        this.error.set(this.t.errors.balance(name));
        return false;
      }
      const kind = this.presets.find((preset) => preset.name === name)?.kind ?? 'BANK';
      toCreate.push({ name, kind, initialBalance });
    }
    if (this.otherChosen()) {
      const name = this.otherName().trim();
      if (!name) {
        this.error.set(this.t.errors.otherName);
        return false;
      }
      const typed = this.otherBalance().trim();
      const initialBalance = typed ? parseTypedAmount(typed) : '0';
      if (initialBalance === undefined) {
        this.error.set(this.t.errors.balance(name));
        return false;
      }
      toCreate.push({ name, kind: 'BANK', initialBalance });
    }

    this.saving.set(true);
    try {
      const created: Account[] = [];
      for (const request of toCreate) {
        created.push(await this.accounts.create(request));
        if (request.name === this.otherName().trim()) this.otherChosen.set(false);
        else this.selected.update((list) => list.filter((n) => n !== request.name));
      }
      await this.saveExtras(created);
      return true;
    } catch (error) {
      this.error.set(errorMessage(error));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private async saveExtras(created: readonly Account[]): Promise<void> {
    const all = [...created, ...this.existing()];
    for (const extra of [...this.extras()]) {
      const account = all.find((a) => sameName(a.name, extra.account));
      if (!account) continue;
      // The currency is turned on in the profile if it wasn't (rule "Onboarding").
      const enabled = this.auth.user()?.currencies ?? [];
      if (!enabled.includes(extra.currency)) {
        await this.auth.updateProfile({ currencies: [...enabled, extra.currency] });
      }
      await this.accounts.createPocket(account.id, {
        name: extra.currency,
        kind: 'AVAILABLE',
        currency: extra.currency,
        instrument: null,
        initialBalance: extra.amount,
      });
      this.extras.update((list) => list.filter((e) => e !== extra));
    }
  }
}
