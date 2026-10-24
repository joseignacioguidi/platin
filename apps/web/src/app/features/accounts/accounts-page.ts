import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucidePlus } from '@lucide/angular';
import type { Account } from '@platin/contracts';
import type { AccountType } from '@platin/domain';
import { PlBottomSheet, PlButton, PlEmptyState, PlListItem, PlMoney, PlTone } from '@platin/web-ui';
import { AccountFormSheet } from './account-form-sheet';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

export const ACCOUNT_ICONS: Record<AccountType, { icon: string; tone: PlTone }> = {
  CASH: { icon: 'banknote', tone: 'brand' },
  BANK: { icon: 'landmark', tone: 'transfer' },
  WALLET: { icon: 'wallet', tone: 'transfer' },
  SAVINGS: { icon: 'piggy-bank', tone: 'savings' },
  INVESTMENT: { icon: 'trending-up', tone: 'card' },
};

/** CTA-02: accounts with their balance and the total per currency. */
@Component({
  selector: 'pl-accounts-page',
  imports: [RouterLink, PlButton, PlEmptyState, PlListItem, PlMoney, LucidePlus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <button plButton size="sm" type="button" (click)="create()">
        <svg lucidePlus [size]="18"></svg>{{ texts.new }}
      </button>
    </header>

    @if (store.resource.hasValue() && visible().length === 0 && !showArchived()) {
      <pl-empty-state icon="wallet" [heading]="texts.emptyTitle" [description]="texts.emptyBody">
        <button plButton type="button" (click)="create()">{{ texts.new }}</button>
      </pl-empty-state>
    } @else {
      <section
        class="flex flex-col gap-2 rounded-card bg-surface p-5"
        [attr.aria-label]="texts.totals"
      >
        <h2 class="text-sm text-muted">{{ texts.totals }}</h2>
        <div class="flex flex-wrap gap-x-8 gap-y-1">
          <pl-money class="text-3xl font-semibold" [amount]="store.totals().ARS" currency="ARS" />
          <pl-money class="text-3xl font-semibold" [amount]="store.totals().USD" currency="USD" />
        </div>
        <p class="text-xs text-muted">{{ texts.totalsHint }}</p>
      </section>

      <ul class="rounded-tile bg-surface px-4">
        @for (account of visible(); track account.id) {
          <li class="border-b border-line-soft last:border-b-0">
            <a [routerLink]="['/app/cuentas', account.id]" class="block rounded-xl">
              <pl-list-item
                [heading]="account.name"
                [subtitle]="subtitle(account)"
                [icon]="icons[account.type].icon"
                [tone]="icons[account.type].tone"
              >
                <pl-money
                  class="text-[17px]"
                  [amount]="account.balance"
                  [currency]="account.currency"
                />
              </pl-list-item>
            </a>
          </li>
        }
      </ul>
      <button
        type="button"
        class="min-h-11 self-center text-sm font-medium text-brand-strong"
        (click)="toggleArchived()"
      >
        {{ showArchived() ? texts.hideArchived : texts.showArchived }}
      </button>
    }
  `,
})
export class AccountsPage implements OnInit {
  /** `?nueva=1` opens the creation sheet (from the quick entry or onboarding). */
  readonly nueva = input<string>();

  protected readonly texts = ACCOUNTS_TEXTS;
  protected readonly icons = ACCOUNT_ICONS;
  protected readonly store = inject(AccountsStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);

  protected readonly showArchived = signal(false);
  private readonly archived = signal<Account[]>([]);
  protected readonly visible = computed(() =>
    this.showArchived() ? [...this.store.accounts(), ...this.archived()] : this.store.accounts(),
  );

  ngOnInit(): void {
    if (this.nueva()) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.create();
    }
  }

  protected subtitle(account: Account): string {
    const type = this.texts.types[account.type];
    return account.archived
      ? `${type} · ${this.texts.archivedBadge}`
      : `${type} · ${account.currency}`;
  }

  protected create(): void {
    this.sheet.open(AccountFormSheet, { data: null, ariaLabel: this.texts.new });
  }

  protected async toggleArchived(): Promise<void> {
    const next = !this.showArchived();
    if (next) {
      const response = await this.store.listArchived();
      this.archived.set(response.filter((account) => account.archived));
    }
    this.showArchived.set(next);
  }
}
