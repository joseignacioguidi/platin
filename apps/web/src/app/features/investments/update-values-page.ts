import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronLeft } from '@lucide/angular';
import type { InvestmentPocket } from '@platin/contracts';
import { LocalDate, Money, parseLocalDate, yieldFromValuation } from '@platin/domain';
import {
  formatDate,
  HideAmounts,
  moneyText,
  parseTypedAmount,
  PlButton,
  PlDateField,
  PlErrorState,
  PlMoney,
  PlSkeleton,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';

/**
 * INV-03: the current value of every investment in one pass, usually at the start of the
 * month. Empty fields are left as they are; one button saves them all.
 */
@Component({
  selector: 'pl-update-values-page',
  imports: [
    RouterLink,
    PlButton,
    PlMoney,
    PlDateField,
    PlSkeleton,
    PlErrorState,
    FormField,
    LucideChevronLeft,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center gap-2">
      <a
        routerLink="/app/inversiones"
        class="flex size-11 items-center justify-center rounded-full hover:bg-field"
        [attr.aria-label]="back"
      >
        <svg lucideChevronLeft [size]="24"></svg>
      </a>
      <h1 class="text-3xl font-bold">{{ t.title }}</h1>
    </header>
    <p class="text-[15px] text-muted">{{ t.intro }}</p>

    @if (store.resource.error() && !store.resource.hasValue()) {
      <pl-error-state (retry)="store.resource.reload()" />
    } @else if (!store.resource.hasValue()) {
      <pl-skeleton [heights]="[60, 120, 120]" />
    } @else {
      <pl-form-field [label]="t.date" controlId="values-date">
        <pl-date-field
          inputId="values-date"
          [label]="t.date"
          [max]="today.date()"
          [value]="date()"
          (valueChange)="setDate($event)"
        />
      </pl-form-field>

      @for (account of store.investments()?.accounts ?? []; track account.id) {
        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-bold">{{ account.name }}</h2>
          <ul class="flex flex-col gap-2">
            @for (pocket of account.pockets; track pocket.id) {
              <li class="flex flex-col gap-2 rounded-tile bg-surface p-4">
                <div class="flex items-baseline justify-between gap-3">
                  <span class="truncate text-[17px] font-semibold">{{ pocket.name }}</span>
                  <pl-money [amount]="pocket.balance" [currency]="pocket.currency" />
                </div>
                <span class="text-sm text-muted">{{ lastText(pocket) }}</span>
                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <input
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    [class]="input + ' font-amount'"
                    [attr.aria-label]="
                      t.current + ' · ' + pocket.name + ' (' + pocket.currency + ')'
                    "
                    [placeholder]="t.current + ' (' + pocket.currency + ')'"
                    [value]="typed()[pocket.id] ?? ''"
                    (input)="type(pocket.id, $event)"
                  />
                  @if (difference(pocket); as diff) {
                    <span
                      class="font-amount flex flex-col items-end text-sm"
                      [class.text-brand-strong]="!diff.isNegative()"
                      aria-live="polite"
                    >
                      <span class="text-xs text-muted">{{ t.difference }}</span>
                      <span>
                        {{ diff.isNegative() ? '−' : '+' }}
                        <pl-money [amount]="diff.abs()" [currency]="pocket.currency" sign="never" />
                      </span>
                    </span>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ t.save }}
      </button>
    }
  `,
})
export class UpdateValuesPage {
  protected readonly t = INVESTMENTS_TEXTS.updatePage;
  protected readonly back = INVESTMENTS_TEXTS.title;
  protected readonly input = INPUT_CLASS;
  protected readonly store = inject(InvestmentsStore);
  protected readonly today = inject(Today);
  private readonly router = inject(Router);
  private readonly hideAmounts = inject(HideAmounts);

  protected readonly date = signal<LocalDate>(this.today.date());
  /** What was typed per pocket id (empty = leave it as it is). */
  protected readonly typed = signal<Record<string, string>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Pockets with a value typed, ready to send. */
  private readonly entries = computed(() =>
    this.store
      .pockets()
      .map((pocket) => ({ pocket, raw: (this.typed()[pocket.id] ?? '').trim() }))
      .filter((entry) => entry.raw !== ''),
  );

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected type(pocketId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.typed.update((typed) => ({ ...typed, [pocketId]: value }));
  }

  protected lastText(pocket: InvestmentPocket): string {
    const last = pocket.lastValuation;
    if (!last) return this.t.noLast;
    return this.t.last(
      moneyText(last.value, pocket.currency, this.hideAmounts.hidden()),
      formatDate(parseLocalDate(last.date)),
    );
  }

  /** Live preview against today's balance (the API uses the balance at the chosen date). */
  protected difference(pocket: InvestmentPocket): Money | null {
    const parsed = parseTypedAmount(this.typed()[pocket.id] ?? '');
    if (!parsed) return null;
    return yieldFromValuation(
      Money.of(pocket.balance, pocket.currency),
      Money.of(parsed, pocket.currency),
    );
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const entries = this.entries();
    if (entries.length === 0) return this.error.set(this.t.nothing);
    const items = [];
    for (const { pocket, raw } of entries) {
      const value = parseTypedAmount(raw);
      if (value === undefined) return this.error.set(this.t.invalid(pocket.name));
      items.push({ pocketId: pocket.id, date: this.date(), value });
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.saveValuations({ items });
      await this.router.navigateByUrl('/app/inversiones');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
