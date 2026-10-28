import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideListFilter, LucideSearch, LucideX } from '@lucide/angular';
import type { Movement, MovementsSummary } from '@platin/contracts';
import { Period } from '@platin/domain';
import {
  PlBottomSheet,
  PlButton,
  PlChip,
  PlEmptyState,
  PlMoney,
  PlMonthPicker,
  PlSelect,
  PlSelectOption,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { MovementGroups } from './movement-groups';
import { MovementSheet } from './movement-sheet';
import { MovementFilters, MovementsList } from './movements-list';
import { TRANSACTIONS_TEXTS } from './transactions.texts';

type Chip = 'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'CARD' | 'PENDING';

/** MOV-03: month, totals, filters, search and the list grouped by day. */
@Component({
  selector: 'pl-movements-page',
  imports: [
    PlMonthPicker,
    PlSelect,
    PlChip,
    PlMoney,
    PlButton,
    PlEmptyState,
    MovementGroups,
    LucideSearch,
    LucideListFilter,
    LucideX,
  ],
  providers: [MovementsList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <div class="flex gap-2">
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full border border-line bg-surface"
          [attr.aria-label]="searching() ? texts.closeSearch : texts.search"
          [attr.aria-expanded]="searching()"
          (click)="toggleSearch()"
        >
          @if (searching()) {
            <svg lucideX [size]="20"></svg>
          } @else {
            <svg lucideSearch [size]="20"></svg>
          }
        </button>
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full border border-line bg-surface"
          [class.bg-field]="showFilters()"
          [attr.aria-label]="texts.filters"
          [attr.aria-expanded]="showFilters()"
          (click)="showFilters.set(!showFilters())"
        >
          <svg lucideListFilter [size]="20"></svg>
        </button>
      </div>
    </header>

    @if (searching()) {
      <input
        #searchInput
        type="search"
        class="min-h-12 rounded-2xl border border-line bg-surface px-4"
        [placeholder]="texts.searchPlaceholder"
        [attr.aria-label]="texts.search"
        [value]="search()"
        (input)="onSearch($event)"
      />
    }
    @if (showFilters()) {
      <pl-select
        [label]="texts.accountFilter"
        [options]="accountOptions()"
        [emptyLabel]="texts.allAccounts"
        [value]="accountId() || null"
        (valueChange)="accountId.set($event ?? '')"
      />
    }

    <pl-month-picker [(value)]="period" [max]="today.period()" />

    <div class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1 rounded-tile bg-surface p-4">
        <span class="flex items-center gap-2 text-[15px] text-muted">
          <span class="size-2.5 rounded-full bg-brand" aria-hidden="true"></span>{{ texts.income }}
        </span>
        <pl-money
          class="text-2xl font-semibold"
          [amount]="summary()?.income ?? '0'"
          [currency]="base()"
        />
      </div>
      <div class="flex flex-col gap-1 rounded-tile bg-surface p-4">
        <span class="flex items-center gap-2 text-[15px] text-muted">
          <span class="size-2.5 rounded-full bg-expense" aria-hidden="true"></span
          >{{ texts.expense }}
        </span>
        <pl-money
          class="text-2xl font-semibold"
          [amount]="summary()?.expense ?? '0'"
          [currency]="base()"
        />
      </div>
    </div>

    <div
      class="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
      role="group"
      [attr.aria-label]="texts.filters"
    >
      @for (chip of chips; track chip) {
        <button plChip tone="ink" [selected]="chip === filter()" (click)="filter.set(chip)">
          {{ texts.chips[chip] }}
          @if (chip === 'PENDING' && (summary()?.pendingCount ?? 0) > 0) {
            <span class="font-amount rounded-full bg-pending px-1.5 text-xs text-ink">
              {{ summary()?.pendingCount }}
            </span>
          }
        </button>
      }
    </div>

    @if (list.error()) {
      <div
        class="flex flex-col items-center gap-3 rounded-tile bg-surface p-6 text-center"
        role="alert"
      >
        <p>{{ list.error() }}</p>
        <button plButton="secondary" type="button" (click)="reload()">{{ texts.retry }}</button>
      </div>
    } @else if (list.loaded() && list.items().length === 0) {
      <pl-empty-state
        icon="receipt"
        [heading]="texts.emptyTitle"
        [description]="filtered() ? texts.emptyFiltered : texts.emptyBody"
      />
    } @else {
      <pl-movement-groups
        [movements]="list.items()"
        [baseCurrency]="base()"
        (selected)="open($event)"
      />
      @if (list.hasMore()) {
        <button
          plButton="secondary"
          type="button"
          class="self-center"
          [disabled]="list.loading()"
          (click)="list.loadMore()"
        >
          {{ list.loading() ? texts.loading : texts.loadMore }}
        </button>
      }
    }
  `,
})
export class MovementsPage {
  protected readonly texts = TRANSACTIONS_TEXTS;
  protected readonly today = inject(Today);
  protected readonly accounts = inject(AccountsStore);
  protected readonly list = inject(MovementsList);
  private readonly auth = inject(AuthService);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly chips: Chip[] = ['ALL', 'EXPENSE', 'INCOME', 'TRANSFER', 'CARD', 'PENDING'];
  protected readonly period = signal<Period>(this.today.period());
  protected readonly filter = signal<Chip>('ALL');
  protected readonly accountId = signal('');
  protected readonly accountOptions = computed<PlSelectOption[]>(() =>
    this.accounts.accounts().map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly search = signal('');
  protected readonly searching = signal(false);
  protected readonly showFilters = signal(false);

  protected readonly base = computed(() => this.auth.user()?.baseCurrency ?? 'ARS');
  protected readonly filtered = computed(
    () => this.filter() !== 'ALL' || !!this.accountId() || !!this.search(),
  );

  private readonly summaryResource = httpResource<MovementsSummary>(() => ({
    url: `${API}/movements/summary`,
    params: { period: this.period() },
  }));
  protected readonly summary = computed(() => this.summaryResource.value());

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    reloadOn(this.bus, ['movements'], () => this.summaryResource.reload());
    effect(() => void this.list.load(this.filters()));
  }

  private filters(): MovementFilters {
    const chip = this.filter();
    return {
      period: this.period(),
      accountId: this.accountId() || undefined,
      q: this.search() || undefined,
      type:
        chip === 'EXPENSE' || chip === 'INCOME' || chip === 'TRANSFER' || chip === 'CARD'
          ? chip
          : undefined,
      status: chip === 'PENDING' ? 'PENDING' : undefined,
    };
  }

  protected toggleSearch(): void {
    const next = !this.searching();
    this.searching.set(next);
    if (next) setTimeout(() => this.searchInput()?.nativeElement.focus());
    else this.search.set('');
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search.set(value), 300);
  }

  protected reload(): void {
    void this.list.load(this.filters());
  }

  protected open(movement: Movement): void {
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: this.texts.title });
  }
}
