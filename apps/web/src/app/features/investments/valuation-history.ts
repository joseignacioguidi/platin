import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Currency } from '@platin/domain';
import type { Valuation } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { formatDate, PlButton, PlMoney } from '@platin/web-ui';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { errorMessage } from '../../core/errors';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';

/** INV-04: the valuations of an investment pocket and "undo the last update". */
@Component({
  selector: 'pl-valuation-history',
  imports: [RouterLink, PlButton, PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    <div class="flex items-baseline justify-between">
      <h2 class="text-lg font-bold">{{ t.title }}</h2>
      <a
        routerLink="/app/inversiones/actualizar"
        class="min-h-11 content-center font-semibold text-brand-strong"
        >{{ t.update }}</a
      >
    </div>
    @if (items().length === 0) {
      <p class="rounded-tile bg-surface p-4 text-[15px] text-muted">{{ t.empty }}</p>
    } @else {
      <ul class="rounded-tile bg-surface px-4">
        @for (valuation of items(); track valuation.id) {
          <li class="flex min-h-14 items-center gap-3 border-b border-line-soft last:border-b-0">
            <span class="font-amount w-24 shrink-0 text-sm text-muted">{{
              dateText(valuation.date)
            }}</span>
            <pl-money
              class="flex-1 text-[17px]"
              [amount]="valuation.value"
              [currency]="currency()"
            />
            <span
              class="font-amount inline-flex gap-[1ch] text-sm"
              [class.text-brand-strong]="!valuation.yield.startsWith('-')"
              [attr.aria-label]="t.yield"
            >
              <span>{{ valuation.yield.startsWith('-') ? '−' : '+' }}</span>
              <pl-money
                [amount]="valuation.yield.replace('-', '')"
                [currency]="currency()"
                sign="never"
              />
            </span>
          </li>
        }
      </ul>
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button
        plButton="ghost"
        type="button"
        class="self-center"
        [disabled]="busy()"
        (click)="undo()"
      >
        {{ t.undo }}
      </button>
      <p class="text-center text-xs text-muted">{{ t.undoHint }}</p>
    }
  `,
})
export class ValuationHistory {
  readonly pocketId = input.required<string>();
  readonly currency = input.required<Currency>();

  protected readonly t = INVESTMENTS_TEXTS.history;
  private readonly store = inject(InvestmentsStore);
  private readonly bus = inject(RefreshBus);
  protected readonly items = signal<Valuation[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => void this.load(this.pocketId()));
    reloadOn(this.bus, ['accounts'], () => void this.load(this.pocketId()));
  }

  protected dateText(date: string): string {
    return formatDate(parseLocalDate(date));
  }

  protected async undo(): Promise<void> {
    const last = this.items()[0];
    if (!last || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.store.removeValuation(last.id);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(pocketId: string): Promise<void> {
    try {
      this.items.set((await this.store.valuationsOf(pocketId)).items);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
