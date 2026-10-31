import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft, LucideSearch } from '@lucide/angular';
import type { ChargeListItem, ChargeStatus } from '@platin/contracts';
import { formatMoney, LocalDate, Money, parseLocalDate } from '@platin/domain';
import {
  formatDate,
  PlBottomSheet,
  PlDateField,
  PlEmptyState,
  PlErrorState,
  PlListItem,
  PlMoney,
  PlSegmented,
  PlSegmentOption,
  PlSkeleton,
} from '@platin/web-ui';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { ChargeFormData, ChargeFormSheet } from './charge-form-sheet';
import { CardsStore } from './cards.store';
import { CARDS_TEXTS } from './cards.texts';

type StatusFilter = 'all' | ChargeStatus;

const PAGE = 30;
const SEARCH_DELAY_MS = 300;

/**
 * TAR-13: every purchase of a card (/app/tarjetas/:id/compras) or of all of them
 * (/app/tarjetas/compras), with search, status and dates. Tapping one opens it to edit.
 */
@Component({
  selector: 'pl-charges-page',
  imports: [
    RouterLink,
    PlSegmented,
    PlDateField,
    PlListItem,
    PlMoney,
    PlEmptyState,
    PlErrorState,
    PlSkeleton,
    LucideChevronLeft,
    LucideSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center gap-2">
      <a
        [routerLink]="id() ? ['/app/tarjetas', id()] : '/app/tarjetas'"
        class="flex size-11 items-center justify-center rounded-full hover:bg-field"
        [attr.aria-label]="t.back"
      >
        <svg lucideChevronLeft [size]="24"></svg>
      </a>
      <h1 class="truncate text-2xl font-bold">{{ heading() }}</h1>
    </header>

    <div class="flex flex-col gap-3">
      <label class="relative block">
        <span class="sr-only">{{ t.search }}</span>
        <svg
          lucideSearch
          [size]="18"
          class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        ></svg>
        <input
          type="search"
          maxlength="60"
          class="min-h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11"
          [placeholder]="t.search"
          [value]="query()"
          (input)="onSearch($event)"
        />
      </label>
      <pl-segmented
        tone="surface"
        [label]="t.status"
        [options]="statusOptions"
        [value]="status()"
        (valueChange)="status.set($event)"
      />
      <div class="grid grid-cols-2 gap-2">
        <pl-date-field
          appearance="tile"
          [label]="t.from"
          [max]="to()"
          [value]="from()"
          (valueChange)="from.set($event)"
        />
        <pl-date-field
          appearance="tile"
          [label]="t.to"
          [min]="from()"
          [value]="to()"
          (valueChange)="to.set($event)"
        />
      </div>
      @if (from() || to()) {
        <button
          type="button"
          class="min-h-11 self-start text-sm font-semibold text-brand-strong"
          (click)="clearDates()"
        >
          {{ t.clearDates }}
        </button>
      }
    </div>

    @if (error() && items().length === 0) {
      <pl-error-state (retry)="load(true)" />
    } @else if (loading() && items().length === 0) {
      <pl-skeleton [heights]="[72, 72, 72, 72]" />
    } @else {
      <ul class="rounded-tile bg-surface px-4">
        @for (item of items(); track item.id) {
          <li class="border-b border-line-soft last:border-b-0">
            <button
              type="button"
              class="block w-full rounded-xl text-left"
              [attr.aria-label]="t.open(item.description)"
              (click)="open(item)"
            >
              <pl-list-item
                [heading]="item.description"
                [subtitle]="subtitle(item)"
                [icon]="item.category.icon"
                [tone]="item.status === 'finished' ? 'muted' : 'card'"
              >
                <span class="flex flex-col items-end gap-0.5">
                  <pl-money
                    class="text-[17px]"
                    [amount]="item.totalAmount"
                    [currency]="item.currency"
                  />
                  <span class="flex items-center gap-1.5 text-xs text-muted">
                    @if (item.fromFixed) {
                      <span
                        class="rounded-full bg-pending-soft px-2 py-0.5 font-semibold text-pending-ink"
                        >{{ t.fixed }}</span
                      >
                    }
                    @if (item.installmentsCount > 1) {
                      <span class="font-amount">{{
                        t.progress(item.current, item.installmentsCount)
                      }}</span>
                    } @else if (item.status === 'finished') {
                      <span>{{ t.finished }}</span>
                    }
                  </span>
                </span>
              </pl-list-item>
            </button>
          </li>
        } @empty {
          <li>
            <pl-empty-state icon="credit-card" [heading]="filtered() ? t.empty : t.emptyAll" />
          </li>
        }
      </ul>
      @if (cursor()) {
        <button
          type="button"
          class="min-h-11 self-center text-sm font-semibold text-brand-strong"
          [disabled]="loading()"
          (click)="load(false)"
        >
          {{ t.more }}
        </button>
      }
    }
  `,
})
export class ChargesPage {
  /** Card of the route; without it, every card. */
  readonly id = input<string>();

  protected readonly t = CARDS_TEXTS.charges;
  private readonly store = inject(CardsStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);

  protected readonly statusOptions: PlSegmentOption<StatusFilter>[] = (
    ['all', 'active', 'finished'] as const
  ).map((value) => ({ value, label: CARDS_TEXTS.charges.statuses[value] }));

  protected readonly query = signal('');
  /** The search text once the user stops typing. */
  private readonly settledQuery = signal('');
  protected readonly status = signal<StatusFilter>('all');
  protected readonly from = signal<LocalDate | null>(null);
  protected readonly to = signal<LocalDate | null>(null);

  protected readonly items = signal<ChargeListItem[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  /** Answers of an older filter that arrive late are dropped. */
  private requestId = 0;

  protected readonly heading = computed(() => {
    const card = this.store.byId(this.id());
    return card ? this.t.titleOf(card.name) : this.t.title;
  });
  protected readonly filtered = computed(
    () => !!this.settledQuery() || this.status() !== 'all' || !!this.from() || !!this.to(),
  );

  constructor() {
    effect(() => {
      // Any filter change starts over from the first page.
      this.id();
      this.settledQuery();
      this.status();
      this.from();
      this.to();
      untracked(() => void this.load(true));
    });
    reloadOn(this.bus, ['cards'], () => void this.load(true));
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.settledQuery.set(value.trim()), SEARCH_DELAY_MS);
  }

  protected clearDates(): void {
    this.from.set(null);
    this.to.set(null);
  }

  async load(reset: boolean): Promise<void> {
    const request = ++this.requestId;
    this.loading.set(true);
    this.error.set(false);
    try {
      const status = this.status();
      const page = await this.store.chargesPage({
        cardId: this.id(),
        query: this.settledQuery() || undefined,
        status: status === 'all' ? undefined : status,
        from: this.from() ?? undefined,
        to: this.to() ?? undefined,
        cursor: reset ? undefined : (this.cursor() ?? undefined),
        limit: String(PAGE),
      });
      if (request !== this.requestId) return;
      this.items.update((list) => (reset ? page.items : [...list, ...page.items]));
      this.cursor.set(page.nextCursor);
    } catch {
      if (request === this.requestId) this.error.set(true);
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }

  protected subtitle(item: ChargeListItem): string {
    const parts = [formatDate(parseLocalDate(item.date))];
    if (!this.id()) parts.push(item.cardName);
    parts.push(
      item.installmentsCount > 1
        ? this.t.installments(
            item.installmentsCount,
            formatMoney(Money.of(item.installmentAmount, item.currency), { decimals: 'auto' }),
          )
        : this.t.onePayment,
    );
    return parts.join(' · ');
  }

  protected async open(item: ChargeListItem): Promise<void> {
    const card = this.store.byId(item.cardId);
    if (!card) return;
    const charge = await this.store.getCharge(item.id);
    this.sheet.open(ChargeFormSheet, {
      data: { card, charge } satisfies ChargeFormData,
      ariaLabel: CARDS_TEXTS.charge.editTitle,
    });
  }
}
