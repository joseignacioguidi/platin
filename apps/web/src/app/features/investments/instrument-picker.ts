import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { LucideCheck, LucideSearch } from '@lucide/angular';
import type { Instrument, InstrumentsResponse, Listing } from '@platin/contracts';
import type { Currency } from '@platin/domain';
import { PL_CURRENCY_NAMES } from '@platin/web-ui';
import { API } from '../../core/api';
import { INVESTMENTS_TEXTS } from './investments.texts';

const DEBOUNCE_MS = 300;

/**
 * INV-07: picks an instrument of the catalog for an investment, by ticker or name, or "Lo sigo a
 * mano" (null). Instruments in another currency show but can't be picked
 * (INSTRUMENT_CURRENCY_MISMATCH).
 */
@Component({
  selector: 'pl-instrument-picker',
  imports: [LucideSearch, LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    <span class="text-sm font-medium">{{ heading }}</span>
    @if (selected(); as chosen) {
      <div class="flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3">
        <svg lucideCheck [size]="20" class="shrink-0 text-brand-strong" aria-hidden="true"></svg>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-semibold">{{ chosen.symbol }}</span>
          <span class="truncate text-sm text-muted">{{ chosen.name }} · {{ chosen.currency }}</span>
        </span>
        <button
          type="button"
          class="min-h-11 shrink-0 px-2 font-semibold text-brand-strong"
          (click)="selected.set(null)"
        >
          {{ t.change }}
        </button>
      </div>
    } @else {
      <label class="relative flex items-center">
        <span class="sr-only">{{ t.search }}</span>
        <svg
          lucideSearch
          [size]="18"
          class="pointer-events-none absolute left-4 text-muted"
          aria-hidden="true"
        ></svg>
        <input
          type="search"
          autocomplete="off"
          class="min-h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 text-[15px]"
          [placeholder]="t.searchPlaceholder(t.examples[type()])"
          [value]="query()"
          (input)="setQuery($event)"
        />
      </label>
      <ul
        class="flex max-h-72 flex-col overflow-y-auto rounded-2xl bg-surface"
        role="listbox"
        [attr.aria-label]="t.search"
      >
        @for (item of items(); track item.id) {
          <li
            role="option"
            [attr.aria-selected]="false"
            [attr.aria-disabled]="item.currency !== currency()"
          >
            <button
              type="button"
              class="flex min-h-14 w-full items-center gap-3 border-b border-line-soft px-4 py-2 text-left last:border-b-0 disabled:opacity-60"
              [disabled]="item.currency !== currency()"
              (click)="selected.set(item)"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold">{{ item.symbol }}</span>
                <span class="truncate text-sm text-muted">
                  @if (item.currency === currency()) {
                    {{ item.name }}
                  } @else {
                    {{ item.name }} · {{ t.otherCurrency(currencyNames[item.currency]) }}
                  }
                </span>
              </span>
              <span class="font-amount shrink-0 text-sm text-muted">{{ item.currency }}</span>
            </button>
          </li>
        } @empty {
          @if (searched()) {
            <li class="px-4 py-3 text-sm text-muted">{{ t.none }}</li>
          }
        }
      </ul>
    }
  `,
})
export class InstrumentPicker {
  protected readonly t = INVESTMENTS_TEXTS.link;
  protected readonly currencyNames = PL_CURRENCY_NAMES;
  protected readonly heading = INVESTMENTS_TEXTS.card.listing;
  readonly type = input.required<Instrument>();
  /** The investment's currency: only instruments in it can be linked. */
  readonly currency = input.required<Currency>();
  readonly selected = model<Listing | null>(null);

  protected readonly query = signal('');
  private readonly debounced = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly results = httpResource<InstrumentsResponse>(() => ({
    url: `${API}/instruments`,
    params: { type: this.type(), q: this.debounced() },
  }));
  /** The ones in the investment's currency first. */
  protected readonly items = computed(() =>
    [...(this.results.value()?.items ?? [])].sort(
      (a, b) => Number(b.currency === this.currency()) - Number(a.currency === this.currency()),
    ),
  );
  protected readonly searched = computed(() => this.results.hasValue() && !!this.debounced());

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    // A new type starts a new search.
    effect(() => {
      this.type();
      this.query.set('');
      this.debounced.set('');
    });
  }

  protected setQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debounced.set(value.trim()), DEBOUNCE_MS);
  }
}
