import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CURRENCIES, type Currency } from '@platin/domain';
import { PL_CURRENCY_NAMES } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { AccountsStore } from '../accounts/accounts.store';
import { FixedStore } from '../fixed/fixed.store';
import { SavingsStore } from '../savings/savings.store';
import { SETTINGS_TEXTS } from './settings.texts';

interface CurrencyRow {
  code: Currency;
  name: string;
  enabled: boolean;
  /** Why it can't be turned off; null when it can. */
  locked: string | null;
}

/**
 * MON-01/04: the six currencies with their state. Pesos and the base are always on; one used by
 * an active pocket, fixed item or goal can't be turned off (the API checks it again).
 */
@Component({
  selector: 'pl-currencies-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-3 rounded-card bg-surface p-5"
      aria-labelledby="currencies-title"
    >
      <div class="flex flex-col gap-1">
        <h2 id="currencies-title" class="text-lg font-bold">{{ t.title }}</h2>
        <p class="text-sm text-muted">{{ t.intro }}</p>
      </div>
      <ul class="flex flex-col">
        @for (row of rows(); track row.code) {
          <li class="border-b border-line-soft last:border-b-0">
            <label
              class="flex min-h-14 items-center gap-3 py-2"
              [class.cursor-pointer]="!row.locked"
            >
              <span class="font-amount w-10 text-sm font-semibold text-muted">{{ row.code }}</span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-medium">{{ row.name }}</span>
                @if (row.locked) {
                  <span class="text-xs text-muted" [id]="'currency-why-' + row.code">{{
                    row.locked
                  }}</span>
                }
              </span>
              <input
                type="checkbox"
                role="switch"
                class="size-5 accent-brand disabled:opacity-60"
                [checked]="row.enabled"
                [disabled]="!!row.locked || saving()"
                [attr.aria-describedby]="row.locked ? 'currency-why-' + row.code : null"
                (change)="toggle(row)"
              />
            </label>
          </li>
        }
      </ul>
      @if (message()) {
        <p class="rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
    </section>
  `,
})
export class CurrenciesSettings {
  private readonly auth = inject(AuthService);
  private readonly accounts = inject(AccountsStore);
  private readonly fixed = inject(FixedStore);
  private readonly savings = inject(SavingsStore);
  protected readonly t = SETTINGS_TEXTS.currenciesSection;
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** What each currency is used by, among the active things (MON-04). */
  private readonly usedBy = computed(() => {
    const used = new Map<Currency, string>();
    for (const goal of this.savings.goals()) {
      if (goal.status === 'ACTIVE') used.set(goal.currency, this.t.usedByGoal);
    }
    for (const item of this.fixed.items()) {
      if (!item.paused && item.next) used.set(item.currency, this.t.usedByFixed);
    }
    for (const pocket of this.accounts.pockets()) used.set(pocket.currency, this.t.usedByPocket);
    return used;
  });

  protected readonly rows = computed<CurrencyRow[]>(() => {
    const user = this.auth.user();
    const enabled = user?.currencies ?? ['ARS', 'USD'];
    const base = user?.baseCurrency ?? 'ARS';
    return CURRENCIES.map((code) => {
      const on = enabled.includes(code);
      const locked =
        code === 'ARS'
          ? this.t.alwaysPesos
          : code === base
            ? this.t.isBase
            : on
              ? (this.usedBy().get(code) ?? null)
              : null;
      return { code, name: PL_CURRENCY_NAMES[code], enabled: on, locked };
    });
  });

  protected async toggle(row: CurrencyRow): Promise<void> {
    const current = this.auth.user()?.currencies ?? ['ARS', 'USD'];
    const next = row.enabled ? current.filter((code) => code !== row.code) : [...current, row.code];
    this.saving.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      await this.auth.updateProfile({ currencies: next });
      this.message.set(row.enabled ? this.t.turnedOff(row.name) : this.t.turnedOn(row.name));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
