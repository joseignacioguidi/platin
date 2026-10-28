import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowDownToLine,
  LucideChevronLeft,
  LucidePiggyBank,
  LucidePlus,
  LucideTrendingUp,
} from '@lucide/angular';
import type { Account, Movement } from '@platin/contracts';
import type { TransferIntent } from '@platin/domain';
import {
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
import { AccountFormSheet } from './account-form-sheet';
import { ACCOUNTS_TEXTS } from './accounts.texts';
import { MoveSheet, MoveSheetData } from './move-sheet';
import { PocketFormData, PocketFormSheet } from './pocket-form-sheet';

/** CTA-02/03/05: one account, its pockets, the quick actions and its movements. */
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
    LucidePiggyBank,
    LucideTrendingUp,
    LucideArrowDownToLine,
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
            <pl-money
              class="text-4xl font-semibold tracking-tight"
              [amount]="account.totals.ARS"
              currency="ARS"
            />
            @if (account.totals.USD !== '0.00') {
              <pl-money
                class="text-2xl font-semibold"
                [amount]="account.totals.USD"
                currency="USD"
              />
            }
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2" role="group" [attr.aria-label]="texts.detail.actions">
          <button plButton="secondary" type="button" (click)="move('SAVE')">
            <svg lucidePiggyBank [size]="18"></svg>{{ texts.move.titles.SAVE }}
          </button>
          <button plButton="secondary" type="button" (click)="move('INVEST')">
            <svg lucideTrendingUp [size]="18"></svg>{{ texts.move.titles.INVEST }}
          </button>
          <button plButton="secondary" type="button" (click)="move('REDEEM')">
            <svg lucideArrowDownToLine [size]="18"></svg>{{ texts.move.titles.REDEEM }}
          </button>
        </div>
      </section>

      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold">{{ texts.detail.pockets }}</h2>
        <button
          plButton="ghost"
          size="sm"
          type="button"
          [attr.aria-label]="texts.detail.addPocketLabel"
          (click)="addPocket()"
        >
          <svg lucidePlus [size]="18"></svg>{{ texts.detail.addPocket }}
        </button>
      </div>
      <ul class="rounded-tile bg-surface px-4">
        @for (pocket of pockets(); track pocket.id) {
          <li class="border-b border-line-soft last:border-b-0">
            <a
              [routerLink]="['/app/apartados', pocket.id]"
              class="block rounded-xl"
              [attr.aria-label]="texts.detail.openPocket(pocket.name)"
            >
              <pl-list-item
                [heading]="pocket.name"
                [subtitle]="
                  (pocket.instrument
                    ? texts.instruments[pocket.instrument]
                    : texts.pocketKinds[pocket.kind]) +
                  ' · ' +
                  pocket.currency
                "
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
  protected readonly base = computed(() => this.auth.user()?.baseCurrency ?? 'ARS');

  constructor() {
    effect(() => void this.list.load({ accountId: this.id() }));
    reloadOn(this.bus, ['accounts'], () => this.resource.reload());
  }

  protected move(intent: TransferIntent): void {
    const account = this.account();
    if (account) {
      this.sheet.open(MoveSheet, {
        data: { account, intent } satisfies MoveSheetData,
        ariaLabel: this.texts.move.titles[intent],
      });
    }
  }

  protected addPocket(): void {
    this.sheet.open(PocketFormSheet, {
      data: { accountId: this.id() } satisfies PocketFormData,
      ariaLabel: this.texts.detail.addPocketLabel,
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
