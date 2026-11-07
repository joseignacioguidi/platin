import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { UpdateUserRequest } from '@platin/contracts';
import { CURRENCIES, type CardCurrency, type Currency, type RateType } from '@platin/domain';
import { PL_CURRENCY_NAMES, PlSegmented, PlSegmentOption } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { AccountsStore } from '../accounts/accounts.store';
import { FixedStore } from '../fixed/fixed.store';
import { SavingsStore } from '../savings/savings.store';
import { PROFILE_GROUP } from './profile-group';
import { SETTINGS_TEXTS } from './settings.texts';

interface CurrencyRow {
  code: Currency;
  name: string;
  enabled: boolean;
  /** Why it can't be turned off, short; null when it can. */
  locked: string | null;
  /** The same, with what to do about it. */
  lockedHint: string | null;
}

/**
 * AUTH-10 "Monedas y cotización": base currency and valuation rate (AUTH-04), and the six
 * currencies with their state (MON-01/04). Every change saves on its own, without a button.
 * Pesos and the base are always on; one used by an active pocket, fixed item or goal can't be
 * turned off (the API checks it again).
 */
@Component({
  selector: 'pl-currencies-settings',
  imports: [PlSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section [class]="group.section" aria-labelledby="currencies-title">
      <div class="flex flex-col gap-1">
        <h2 id="currencies-title" [class]="group.title">{{ t.title }}</h2>
        <p class="hidden text-sm text-muted lg:block">{{ t.autosave }}</p>
      </div>
      <div [class]="group.body">
        <div class="flex flex-wrap gap-x-5 gap-y-4">
          <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
            <span class="text-sm font-semibold">{{ p.baseCurrency }}</span>
            <pl-segmented
              [label]="p.baseCurrency"
              [options]="currencyOptions"
              [value]="baseCurrency()"
              (valueChange)="saveBase($event)"
            />
            <p class="text-[13px] text-muted">{{ p.baseCurrencyHint }}</p>
          </div>
          <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
            <span class="text-sm font-semibold">{{ p.valuationRate }}</span>
            <pl-segmented
              [label]="p.valuationRate"
              [options]="rateOptions"
              [value]="valuationRate()"
              (valueChange)="saveRate($event)"
            />
            <p class="text-[13px] text-muted">{{ p.valuationHint }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-1 border-t border-line-soft pt-4">
          <h3 class="text-[15px] font-bold">{{ t.enabledTitle }}</h3>
          <p class="text-[13px] text-muted">{{ t.intro }}</p>
        </div>
        <ul
          class="flex flex-col lg:grid lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] lg:gap-2"
        >
          @for (row of rows(); track row.code) {
            <li
              class="border-b border-line-soft last:border-b-0 lg:rounded-2xl lg:border lg:border-line-soft lg:last:border-b"
              [class]="row.enabled ? 'lg:border-transparent lg:bg-field' : ''"
            >
              <label
                class="flex min-h-14 items-center gap-3 py-2 lg:px-3.5"
                [class.cursor-pointer]="!row.locked"
                [attr.title]="row.lockedHint"
              >
                <span class="font-amount w-10 text-[13px] font-semibold text-muted">{{
                  row.code
                }}</span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-[15px]" [class.font-semibold]="row.enabled">{{
                    row.name
                  }}</span>
                  @if (row.locked) {
                    <span class="text-xs text-muted" [id]="'currency-why-' + row.code">{{
                      row.locked
                    }}</span>
                    @if (row.lockedHint) {
                      <span class="sr-only">{{ row.lockedHint }}</span>
                    }
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
      </div>
    </section>
  `,
})
export class CurrenciesSettings {
  private readonly auth = inject(AuthService);
  private readonly accounts = inject(AccountsStore);
  private readonly fixed = inject(FixedStore);
  private readonly savings = inject(SavingsStore);
  protected readonly t = SETTINGS_TEXTS.currenciesSection;
  protected readonly p = SETTINGS_TEXTS.profile;
  protected readonly group = PROFILE_GROUP;
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly currencyOptions: PlSegmentOption<CardCurrency>[] = (
    ['ARS', 'USD'] as const
  ).map((value) => ({ value, label: SETTINGS_TEXTS.currencies[value] }));
  protected readonly rateOptions: PlSegmentOption<RateType>[] = (
    ['OFICIAL', 'MEP', 'BLUE'] as const
  ).map((value) => ({ value, label: SETTINGS_TEXTS.rates[value] }));

  /**
   * What the switches show: the user's value, or the one just chosen while it saves. If the
   * save fails it goes back to the user's (AUTH-10).
   */
  private readonly draftBase = signal<CardCurrency | null>(null);
  private readonly draftRate = signal<RateType | null>(null);
  protected readonly baseCurrency = computed(
    () => this.draftBase() ?? this.auth.user()?.baseCurrency ?? 'ARS',
  );
  protected readonly valuationRate = computed(
    () => this.draftRate() ?? this.auth.user()?.valuationRate ?? 'MEP',
  );

  /** What each currency is used by, among the active things (MON-04). */
  private readonly usedBy = computed(() => {
    const used = new Map<Currency, [short: string, hint: string]>();
    for (const goal of this.savings.goals()) {
      if (goal.status === 'ACTIVE')
        used.set(goal.currency, [this.t.usedByGoal, this.t.usedByGoalHint]);
    }
    for (const item of this.fixed.items()) {
      if (!item.paused && item.next) {
        used.set(item.currency, [this.t.usedByFixed, this.t.usedByFixedHint]);
      }
    }
    for (const pocket of this.accounts.pockets()) {
      used.set(pocket.currency, [this.t.usedByPocket, this.t.usedByPocketHint]);
    }
    return used;
  });

  protected readonly rows = computed<CurrencyRow[]>(() => {
    const user = this.auth.user();
    const enabled = user?.currencies ?? ['ARS', 'USD'];
    const base = this.baseCurrency();
    return CURRENCIES.map((code) => {
      const on = enabled.includes(code);
      const [locked, lockedHint] =
        code === 'ARS'
          ? [this.t.alwaysPesos, null]
          : code === base
            ? [this.t.isBase, null]
            : on
              ? (this.usedBy().get(code) ?? [null, null])
              : [null, null];
      return { code, name: PL_CURRENCY_NAMES[code], enabled: on, locked, lockedHint };
    });
  });

  protected async saveBase(baseCurrency: CardCurrency): Promise<void> {
    if (baseCurrency === this.baseCurrency()) return;
    this.draftBase.set(baseCurrency);
    await this.save({ baseCurrency }, this.p.saved);
    this.draftBase.set(null);
  }

  protected async saveRate(valuationRate: RateType): Promise<void> {
    if (valuationRate === this.valuationRate()) return;
    this.draftRate.set(valuationRate);
    await this.save({ valuationRate }, this.p.saved);
    this.draftRate.set(null);
  }

  protected async toggle(row: CurrencyRow): Promise<void> {
    const current = this.auth.user()?.currencies ?? ['ARS', 'USD'];
    const next = row.enabled ? current.filter((code) => code !== row.code) : [...current, row.code];
    await this.save(
      { currencies: next },
      row.enabled ? this.t.turnedOff(row.name) : this.t.turnedOn(row.name),
    );
  }

  private async save(changes: UpdateUserRequest, done: string): Promise<void> {
    this.saving.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      await this.auth.updateProfile(changes);
      this.message.set(done);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
