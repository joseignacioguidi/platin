import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft } from '@lucide/angular';
import type { Movement } from '@platin/contracts';
import { PlBottomSheet, PlButton, PlEmptyState, PlMoney } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { MovementGroups } from '../transactions/movement-groups';
import { MovementSheet } from '../transactions/movement-sheet';
import { MovementsList } from '../transactions/movements-list';
import { AccountFormSheet } from './account-form-sheet';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';
import { AdjustBalanceSheet } from './adjust-balance-sheet';

/** CTA-03: one account with its balance and its movements. */
@Component({
  selector: 'pl-account-detail-page',
  imports: [RouterLink, PlButton, PlMoney, PlEmptyState, MovementGroups, LucideChevronLeft],
  providers: [MovementsList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <a
      routerLink="/app/cuentas"
      class="flex min-h-11 items-center gap-1 self-start text-[15px] text-muted"
    >
      <svg lucideChevronLeft [size]="20"></svg>{{ texts.back }}
    </a>
    @if (account(); as account) {
      <section class="flex flex-col gap-3 rounded-card bg-surface p-5">
        <h1 class="text-2xl font-bold">{{ account.name }}</h1>
        <div class="flex flex-col">
          <span class="text-sm text-muted">{{ texts.balance }}</span>
          <pl-money
            class="text-4xl font-semibold tracking-tight"
            [amount]="account.balance"
            [currency]="account.currency"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <button plButton type="button" (click)="adjust()">{{ texts.adjust }}</button>
          <button plButton="secondary" type="button" (click)="edit()">{{ texts.edit }}</button>
        </div>
      </section>

      <h2 class="text-lg font-bold">{{ texts.movements }}</h2>
      @if (list.loaded() && list.items().length === 0) {
        <pl-empty-state icon="receipt" [heading]="texts.empty" />
      } @else {
        <pl-movement-groups
          [movements]="list.items()"
          [baseCurrency]="base()"
          (selected)="open($event)"
        />
        @if (list.hasMore()) {
          <button plButton="secondary" type="button" class="self-center" (click)="list.loadMore()">
            {{ texts.loadMore }}
          </button>
        }
      }
    }
  `,
})
export class AccountDetailPage {
  readonly id = input.required<string>();

  protected readonly texts = ACCOUNTS_TEXTS.detail;
  protected readonly list = inject(MovementsList);
  private readonly store = inject(AccountsStore);
  private readonly auth = inject(AuthService);
  private readonly sheet = inject(PlBottomSheet);

  protected readonly account = computed(() => this.store.byId(this.id()));
  protected readonly base = computed(() => this.auth.user()?.baseCurrency ?? 'ARS');

  constructor() {
    effect(() => void this.list.load({ accountId: this.id() }));
  }

  protected adjust(): void {
    const account = this.account();
    if (account)
      this.sheet.open(AdjustBalanceSheet, { data: account, ariaLabel: this.texts.adjust });
  }

  protected edit(): void {
    const account = this.account();
    if (account) this.sheet.open(AccountFormSheet, { data: account, ariaLabel: this.texts.edit });
  }

  protected open(movement: Movement): void {
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: this.texts.movements });
  }
}
