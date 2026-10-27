import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AccountType, Currency } from '@platin/domain';
import {
  parseTypedAmount,
  PlButton,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
} from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { AccountsStore } from '../accounts/accounts.store';
import { ACCOUNTS_TEXTS } from '../accounts/accounts.texts';
import { CardsStore } from '../cards/cards.store';
import { ONBOARDING_TEXTS } from './onboarding.texts';

type Step = 'account' | 'card';

const TYPES: AccountType[] = ['BANK', 'WALLET', 'CASH', 'SAVINGS'];

/**
 * AUTH-05 (minimal): right after registering, create the first account with today's balance
 * and, optionally, the first card. Everything can be skipped.
 */
@Component({
  selector: 'pl-welcome-page',
  imports: [PlButton, PlSegmented, PlSelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  template: `
    <header class="flex flex-col gap-2">
      <span class="text-sm font-semibold text-brand-strong">{{
        t.step(step() === 'account' ? 1 : 2)
      }}</span>
      <h1 class="text-3xl font-bold">
        {{ step() === 'account' ? t.accountTitle(name()) : t.cardTitle }}
      </h1>
      <p class="text-[15px] text-muted">{{ step() === 'account' ? t.accountBody : t.cardBody }}</p>
    </header>

    <section class="flex flex-col gap-4 rounded-card bg-surface p-5">
      @if (step() === 'account') {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.accountName }}</span>
          <input
            type="text"
            maxlength="60"
            [class]="input"
            [placeholder]="t.accountPlaceholder"
            [value]="accountName()"
            (input)="accountName.set(value($event))"
          />
        </label>
        <pl-form-field [label]="t.type" controlId="welcome-type">
          <pl-select
            inputId="welcome-type"
            [label]="t.type"
            [options]="typeOptions"
            [value]="type()"
            (valueChange)="type.set($event ?? 'BANK')"
          />
        </pl-form-field>
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.currency }}</span>
          <pl-segmented [label]="t.currency" [options]="currencies" [(value)]="currency" />
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.balance }}</span>
          <input
            type="text"
            inputmode="decimal"
            [class]="input + ' font-amount'"
            [value]="balance()"
            (input)="balance.set(value($event))"
          />
          <span class="text-xs text-muted">{{ t.balanceHint }}</span>
        </label>
      } @else {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ t.cardName }}</span>
          <input
            type="text"
            maxlength="60"
            [class]="input"
            [placeholder]="t.cardPlaceholder"
            [value]="cardName()"
            (input)="cardName.set(value($event))"
          />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ t.closingDay }}</span>
            <input
              type="number"
              min="1"
              max="31"
              inputmode="numeric"
              [class]="input + ' font-amount'"
              [value]="closingDay()"
              (input)="closingDay.set(+value($event))"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ t.dueDay }}</span>
            <input
              type="number"
              min="1"
              max="31"
              inputmode="numeric"
              [class]="input + ' font-amount'"
              [value]="dueDay()"
              (input)="dueDay.set(+value($event))"
            />
          </label>
        </div>
      }
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="next()">
        {{ step() === 'account' ? t.saveAccount : t.saveCard }}
      </button>
    </section>
    <button
      type="button"
      class="min-h-11 self-center text-[15px] font-medium text-muted underline-offset-4 hover:underline"
      (click)="skip()"
    >
      {{ step() === 'account' ? t.skip : t.skipCard }}
    </button>
  `,
})
export class WelcomePage {
  protected readonly t = ONBOARDING_TEXTS;
  protected readonly input = INPUT_CLASS;
  protected readonly typeOptions: PlSelectOption<AccountType>[] = TYPES.map((type) => ({
    value: type,
    label: ACCOUNTS_TEXTS.types[type],
  }));
  private readonly accounts = inject(AccountsStore);
  private readonly cards = inject(CardsStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currencies: PlSegmentOption<Currency>[] = [
    { value: 'ARS', label: 'Pesos' },
    { value: 'USD', label: 'Dólares' },
  ];
  protected readonly step = signal<Step>('account');
  protected readonly accountName = signal('');
  protected readonly type = signal<AccountType>('BANK');
  protected readonly currency = signal<Currency>('ARS');
  protected readonly balance = signal('');
  protected readonly cardName = signal('');
  protected readonly closingDay = signal(30);
  protected readonly dueDay = signal(5);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private accountId: string | null = null;

  protected name(): string {
    return this.auth.user()?.name ?? '';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async next(): Promise<void> {
    this.error.set(null);
    if (this.step() === 'account') {
      if (!this.accountName().trim()) return this.error.set(this.t.errors.accountName);
      const balance = this.balance().trim() ? parseTypedAmount(this.balance()) : '0';
      if (balance === undefined) return this.error.set(this.t.errors.balance);
      await this.run(async () => {
        const account = await this.accounts.create({
          name: this.accountName().trim(),
          type: this.type(),
          currency: this.currency(),
          initialBalance: balance,
        });
        this.accountId = account.id;
        this.step.set('card');
      });
      return;
    }
    if (!this.cardName().trim()) return this.error.set(this.t.errors.cardName);
    await this.run(async () => {
      await this.cards.create({
        name: this.cardName().trim(),
        closingDay: this.closingDay(),
        dueDay: this.dueDay(),
        defaultPaymentAccountId: this.accountId,
      });
      await this.router.navigateByUrl('/app');
    });
  }

  protected skip(): void {
    void this.router.navigateByUrl('/app');
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    try {
      await action();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
