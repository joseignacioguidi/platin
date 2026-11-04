import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft, LucidePlus } from '@lucide/angular';
import type { Account, Movement, Pocket } from '@platin/contracts';
import {
  PL_CURRENCY_NAMES,
  PL_POCKET_ICONS,
  PlBottomSheet,
  PlButton,
  PlEmptyState,
  PlErrorState,
  PlListItem,
  PlMoney,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { MovementGroups } from '../transactions/movement-groups';
import { MovementSheet } from '../transactions/movement-sheet';
import { MovementsList } from '../transactions/movements-list';
import { PlanGate, PlUsage } from '../plans/plan-gate';
import { AccountFormSheet } from './account-form-sheet';
import { ACCOUNTS_TEXTS } from './accounts.texts';
import { PocketFormData, PocketFormSheet } from './pocket-form-sheet';

/** CTA-02/03/04: one account, its balance per currency, its reserves and its movements. */
@Component({
  selector: 'pl-account-detail-page',
  imports: [
    RouterLink,
    PlButton,
    PlMoney,
    PlListItem,
    PlEmptyState,
    PlSkeleton,
    PlErrorState,
    MovementGroups,
    LucideChevronLeft,
    LucidePlus,
    PlanGate,
    PlUsage,
  ],
  providers: [MovementsList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <a
      routerLink="/app/cuentas"
      class="flex min-h-11 items-center gap-1 self-start text-[15px] text-muted"
    >
      <svg lucideChevronLeft [size]="20"></svg>{{ texts.detail.back }}
    </a>
    @if (resource.error() && !resource.hasValue()) {
      <pl-error-state (retry)="resource.reload()" />
    } @else if (!account()) {
      <pl-skeleton [heights]="[160, 72, 72, 72]" />
    } @else if (account(); as account) {
      <section class="flex flex-col gap-3 rounded-card bg-surface p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col">
            <h1 class="text-2xl font-bold">{{ account.name }}</h1>
            <span class="text-sm text-muted">{{ texts.kinds[account.kind] }}</span>
          </div>
          <button plButton="secondary" size="sm" type="button" (click)="edit()">
            {{ texts.detail.edit }}
          </button>
        </div>
        <div class="flex flex-col">
          <span class="text-sm text-muted">{{ texts.detail.total }}</span>
          <div class="flex flex-wrap items-baseline gap-x-6">
            @for (line of account.totals; track line.currency; let first = $first) {
              <pl-money
                [class]="first ? 'text-4xl font-semibold tracking-tight' : 'text-2xl font-semibold'"
                [amount]="line.amount"
                [currency]="line.currency"
              />
            } @empty {
              <pl-money class="text-4xl font-semibold tracking-tight" amount="0" />
            }
          </div>
        </div>
      </section>

      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-bold">{{ texts.detail.balances }}</h2>
        @if (!account.archived) {
          <button plButton="ghost" size="sm" type="button" (click)="addBalance()">
            <svg lucidePlus [size]="18"></svg>{{ texts.detail.addBalance }}
          </button>
        }
      </div>
      <ul class="rounded-tile bg-surface px-4">
        @for (pocket of balances(); track pocket.id) {
          <li class="border-b border-line-soft last:border-b-0">
            <a
              [routerLink]="['/app/reservas', pocket.id]"
              class="block rounded-xl"
              [attr.aria-label]="texts.detail.openPocket(texts.balanceName(pocket.currency))"
            >
              <pl-list-item
                [heading]="texts.balanceName(pocket.currency)"
                [subtitle]="currencyNames[pocket.currency]"
                [icon]="icons.AVAILABLE.icon"
                [tone]="icons.AVAILABLE.tone"
              >
                <pl-money
                  class="text-[17px]"
                  [amount]="pocket.balance"
                  [currency]="pocket.currency"
                />
              </pl-list-item>
            </a>
          </li>
        }
      </ul>

      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-bold">{{ texts.detail.reserves }}</h2>
        <div class="flex items-center gap-1">
          <pl-usage resource="pockets" />
          @if (!account.archived) {
            <button
              plButton="ghost"
              size="sm"
              type="button"
              plPlanGate="pockets"
              [attr.aria-label]="texts.detail.addReserveLabel"
              (click)="addReserve()"
            >
              <svg lucidePlus [size]="18"></svg>{{ texts.detail.addReserve }}
            </button>
          }
        </div>
      </div>
      @if (reserves().length === 0) {
        <p class="rounded-tile bg-surface px-4 py-3 text-[15px] text-muted">
          {{ texts.detail.reservesEmpty }}
        </p>
      } @else {
        <ul class="rounded-tile bg-surface px-4">
          @for (pocket of reserves(); track pocket.id) {
            <li class="border-b border-line-soft last:border-b-0">
              <a
                [routerLink]="['/app/reservas', pocket.id]"
                class="block rounded-xl"
                [attr.aria-label]="texts.detail.openPocket(pocket.name)"
              >
                <pl-list-item
                  [heading]="pocket.name"
                  [subtitle]="reserveSubtitle(pocket)"
                  [icon]="icons[pocket.kind].icon"
                  [tone]="icons[pocket.kind].tone"
                >
                  <pl-money
                    class="text-[17px]"
                    [amount]="pocket.balance"
                    [currency]="pocket.currency"
                  />
                </pl-list-item>
              </a>
            </li>
          }
        </ul>
      }

      <h2 class="text-lg font-bold">{{ texts.pocket.movements }}</h2>
      @if (list.loaded() && list.items().length === 0) {
        <pl-empty-state icon="receipt" [heading]="texts.pocket.empty" />
      } @else {
        <pl-movement-groups
          [movements]="list.items()"
          [baseCurrency]="base()"
          (selected)="open($event)"
        />
        @if (list.hasMore()) {
          <button plButton="secondary" type="button" class="self-center" (click)="list.loadMore()">
            {{ texts.pocket.loadMore }}
          </button>
        }
      }
    }
  `,
})
export class AccountDetailPage {
  readonly id = input.required<string>();

  protected readonly texts = ACCOUNTS_TEXTS;
  protected readonly icons = PL_POCKET_ICONS;
  protected readonly currencyNames = PL_CURRENCY_NAMES;
  protected readonly list = inject(MovementsList);
  private readonly auth = inject(AuthService);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);

  /** By id, so an archived account opens too. */
  protected readonly resource = httpResource<Account>(() => `${API}/accounts/${this.id()}`);
  protected readonly account = computed(() => this.resource.value());
  /** Archived pockets only show inside an archived account. */
  protected readonly pockets = computed(() => {
    const account = this.account();
    if (!account) return [];
    return account.archived ? account.pockets : account.pockets.filter((p) => !p.archived);
  });
  protected readonly balances = computed(() =>
    this.pockets().filter((p) => p.kind === 'AVAILABLE'),
  );
  protected readonly reserves = computed(() =>
    this.pockets().filter((p) => p.kind !== 'AVAILABLE'),
  );
  protected readonly base = computed(() => this.auth.user()?.baseCurrency ?? 'ARS');

  constructor() {
    effect(() => void this.list.load({ accountId: this.id() }));
    reloadOn(this.bus, ['accounts'], () => this.resource.reload());
  }

  protected reserveSubtitle(pocket: Pocket): string {
    const use = pocket.instrument
      ? this.texts.instruments[pocket.instrument]
      : this.texts.pocketKinds[pocket.kind];
    return `${use} · ${pocket.currency}`;
  }

  protected addReserve(): void {
    this.sheet.open(PocketFormSheet, {
      data: { accountId: this.id(), kind: 'SPENDING' } satisfies PocketFormData,
      ariaLabel: this.texts.detail.addReserveLabel,
    });
  }

  protected addBalance(): void {
    this.sheet.open(PocketFormSheet, {
      data: { accountId: this.id(), balance: true } satisfies PocketFormData,
      ariaLabel: this.texts.detail.addBalance,
    });
  }

  protected edit(): void {
    const account = this.account();
    if (account) this.sheet.open(AccountFormSheet, { data: account, ariaLabel: this.texts.edit });
  }

  protected open(movement: Movement): void {
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: this.texts.pocket.movements });
  }
}
