import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideChevronRight, LucideDynamicIcon, LucidePlus } from '@lucide/angular';
import type { Account } from '@platin/contracts';
import type { Currency } from '@platin/domain';
import {
  PL_CURRENCY_NAMES,
  PL_POCKET_ICONS,
  PL_TONE_CLASSES,
  PlBottomSheet,
  PlButton,
  PlEmptyState,
  PlErrorState,
  PlListItem,
  PlMoney,
  PlSkeleton,
  PlTone,
} from '@platin/web-ui';
import { PlanGate, PlUsage, showPlanBlock } from '../plans/plan-gate';
import { PlanStore } from '../plans/plan.store';
import { ACCOUNT_KIND_ICONS, AccountFormSheet } from './account-form-sheet';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

/** CTA-03: each account with its pockets grouped, their balances and the totals per currency. */
@Component({
  selector: 'pl-accounts-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    RouterLink,
    PlButton,
    PlEmptyState,
    PlListItem,
    PlMoney,
    LucidePlus,
    LucideChevronRight,
    LucideDynamicIcon,
    PlanGate,
    PlUsage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col">
        <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
        <pl-usage resource="accounts" />
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          plButton
          size="sm"
          type="button"
          [plPlanGate]="accountGate"
          [attr.aria-label]="texts.newLabel"
          (click)="create()"
        >
          <svg lucidePlus [size]="18"></svg>{{ texts.new }}
        </button>
      </div>
    </header>

    @if (store.resource.error() && !store.resource.hasValue()) {
      <pl-error-state (retry)="store.resource.reload()" />
    } @else if (!store.resource.hasValue()) {
      <pl-skeleton [heights]="[120, 200, 200]" />
    } @else if (visible().length === 0 && !showArchived()) {
      <pl-empty-state icon="wallet" [heading]="texts.emptyTitle" [description]="texts.emptyBody">
        <button plButton type="button" [plPlanGate]="accountGate" (click)="create()">
          {{ texts.newLabel }}
        </button>
      </pl-empty-state>
    } @else {
      <section
        class="flex flex-col gap-2 rounded-card bg-surface p-5"
        [attr.aria-label]="texts.totals"
      >
        <h2 class="text-sm text-muted">{{ texts.totals }}</h2>
        <!-- MON-03: one line per currency in use and the total valued in the base currency. -->
        <ul class="flex flex-col gap-1">
          @for (line of store.totals(); track line.currency; let first = $first) {
            <li class="flex items-baseline justify-between gap-3">
              <span class="text-sm text-muted">{{ currencyNames[line.currency] }}</span>
              <pl-money
                [class]="first ? 'text-3xl font-semibold' : 'text-xl font-semibold'"
                [amount]="line.amount"
                [currency]="line.currency"
              />
            </li>
          } @empty {
            <li><pl-money class="text-3xl font-semibold" amount="0" /></li>
          }
        </ul>
        @if (store.totals().length > 1 && store.totalBase(); as total) {
          <div class="flex items-baseline justify-between gap-3 border-t border-line-soft pt-2">
            <span class="text-sm font-medium">{{ texts.totalBase }}</span>
            <pl-money class="font-semibold" [amount]="total.amount" [currency]="total.currency" />
          </div>
        }
        <p class="text-xs text-muted">{{ texts.totalsHint }}</p>
      </section>

      @for (account of visible(); track account.id) {
        <section
          class="flex flex-col rounded-card bg-surface px-4 pt-2 pb-1"
          [class.opacity-70]="account.archived"
          [attr.aria-labelledby]="'account-' + account.id"
        >
          <a
            [routerLink]="['/app/cuentas', account.id]"
            class="flex min-h-14 items-center gap-3 rounded-xl"
            [attr.aria-label]="texts.openAccount(account.name)"
          >
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-xl"
              [class]="toneClass(account.color ?? 'transfer')"
              aria-hidden="true"
            >
              <svg [lucideIcon]="kindIcons[account.kind]" [size]="20"></svg>
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span
                [id]="'account-' + account.id"
                class="text-lg leading-tight font-bold break-words"
                >{{ account.name }}</span
              >
              <span class="text-sm text-muted">
                {{ texts.kinds[account.kind]
                }}{{ account.archived ? ' · ' + texts.archivedBadge : '' }}
              </span>
            </span>
            <span class="flex flex-col items-end">
              @for (line of account.totals; track line.currency; let first = $first) {
                <pl-money
                  [class]="first ? 'font-semibold' : 'text-sm'"
                  [amount]="line.amount"
                  [currency]="line.currency"
                />
              }
            </span>
            <svg
              lucideChevronRight
              [size]="18"
              class="shrink-0 text-muted"
              aria-hidden="true"
            ></svg>
          </a>
          <ul class="border-t border-line-soft">
            @for (pocket of account.pockets; track pocket.id) {
              <li class="border-b border-line-soft last:border-b-0">
                <a
                  [routerLink]="['/app/apartados', pocket.id]"
                  class="block rounded-xl"
                  [attr.aria-label]="texts.detail.openPocket(pocket.name)"
                >
                  <pl-list-item
                    [heading]="pocket.name"
                    [subtitle]="pocketSubtitle(pocket.kind, pocket.instrument, pocket.currency)"
                    [icon]="pocketIcons[pocket.kind].icon"
                    [tone]="pocketIcons[pocket.kind].tone"
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
        </section>
      }
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
  protected readonly currencyNames = PL_CURRENCY_NAMES;
  protected readonly kindIcons = ACCOUNT_KIND_ICONS;
  protected readonly pocketIcons = PL_POCKET_ICONS;
  protected readonly store = inject(AccountsStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);
  private readonly plan = inject(PlanStore);
  private readonly injector = inject(Injector);
  /** A new account also creates its "Disponible" pocket. */
  protected readonly accountGate = ['accounts', 'pockets'] as const;

  protected readonly showArchived = signal(false);
  private readonly archived = signal<Account[]>([]);
  protected readonly visible = computed(() =>
    this.showArchived() ? [...this.store.accounts(), ...this.archived()] : this.store.accounts(),
  );

  ngOnInit(): void {
    if (this.nueva()) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      const block = this.plan.block(this.accountGate);
      if (block) showPlanBlock(this.injector, block);
      else this.create();
    }
  }

  protected toneClass(tone: PlTone): string {
    return PL_TONE_CLASSES[tone];
  }

  protected pocketSubtitle(
    kind: keyof typeof ACCOUNTS_TEXTS.pocketKinds,
    instrument: keyof typeof ACCOUNTS_TEXTS.instruments | null,
    currency: Currency,
  ): string {
    const what = instrument ? this.texts.instruments[instrument] : this.texts.pocketKinds[kind];
    return `${what} · ${currency}`;
  }

  protected create(): void {
    this.sheet.open(AccountFormSheet, { data: null, ariaLabel: this.texts.newLabel });
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
