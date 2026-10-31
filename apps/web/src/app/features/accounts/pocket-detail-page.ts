import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronLeft } from '@lucide/angular';
import type { Movement, Pocket } from '@platin/contracts';
import { Money, TransferIntent } from '@platin/domain';
import {
  formatPeriodShort,
  moneyText,
  PL_POCKET_ICONS,
  PL_TONE_CLASSES,
  HideAmounts,
  PlBottomSheet,
  PlButton,
  PlEmptyState,
  PlErrorState,
  PlMoney,
  PlSkeleton,
} from '@platin/web-ui';
import { LucideDynamicIcon } from '@lucide/angular';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { errorMessage } from '../../core/errors';
import { Today } from '../../core/today';
import { ValuationHistory } from '../investments/valuation-history';
import { PlanGate } from '../plans/plan-gate';
import type { PlanGateKey } from '../plans/plan.store';
import { MovementGroups } from '../transactions/movement-groups';
import { MovementSheet } from '../transactions/movement-sheet';
import { MovementsList } from '../transactions/movements-list';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';
import { AdjustBalanceSheet } from './adjust-balance-sheet';
import { MoveSheet, MoveSheetData } from './move-sheet';
import { monthEndBalances } from './pocket-balance-history';
import { PocketFormData, PocketFormSheet } from './pocket-form-sheet';

/** Quick actions offered from each kind of pocket. */
const ACTIONS: Record<Pocket['kind'], TransferIntent[]> = {
  AVAILABLE: ['SAVE', 'INVEST'],
  SAVINGS: ['REDEEM', 'INVEST'],
  INVESTMENT: ['REDEEM'],
};

/** CTA-04/06/07: a pocket with its balance, its evolution and its movements. */
@Component({
  selector: 'pl-pocket-detail-page',
  imports: [
    RouterLink,
    PlButton,
    PlMoney,
    PlEmptyState,
    PlSkeleton,
    PlErrorState,
    MovementGroups,
    ValuationHistory,
    LucideChevronLeft,
    LucideDynamicIcon,
    PlanGate,
  ],
  providers: [MovementsList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (resource.error() && !resource.hasValue()) {
      <pl-error-state (retry)="resource.reload()" />
    } @else if (pocket(); as pocket) {
      <a
        [routerLink]="['/app/cuentas', pocket.accountId]"
        class="flex min-h-11 items-center gap-1 self-start text-[15px] text-muted"
      >
        <svg lucideChevronLeft [size]="20"></svg>{{ t.back(pocket.accountName) }}
      </a>
      <section class="flex flex-col gap-4 rounded-card bg-surface p-5">
        <div class="flex items-center gap-3">
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-2xl"
            [class]="toneClass()"
            aria-hidden="true"
          >
            <svg [lucideIcon]="icons[pocket.kind].icon" [size]="22"></svg>
          </span>
          <div class="flex min-w-0 flex-col">
            <h1 class="truncate text-2xl font-bold">{{ pocket.name }}</h1>
            <span class="text-sm text-muted">
              {{ pocket.accountName }} ·
              {{
                pocket.instrument
                  ? texts.instruments[pocket.instrument]
                  : texts.pocketKinds[pocket.kind]
              }}
              · {{ pocket.currency }}
            </span>
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-sm text-muted">{{ t.balance }}</span>
          <pl-money
            class="text-4xl font-semibold tracking-tight"
            [amount]="pocket.balance"
            [currency]="pocket.currency"
          />
        </div>
        @if (!pocket.archived) {
          <div class="flex flex-wrap gap-2">
            @for (intent of actions(); track intent) {
              <button
                plButton
                type="button"
                [plPlanGate]="intent === 'INVEST' ? 'investments' : []"
                (click)="move(intent)"
              >
                {{ texts.move.titles[intent] }}
              </button>
            }
            <button plButton="secondary" type="button" (click)="adjust()">{{ t.adjust }}</button>
            <button plButton="secondary" type="button" (click)="edit()">{{ t.edit }}</button>
          </div>
        }
      </section>

      @if (history().length > 1) {
        <section class="flex flex-col gap-3 rounded-tile bg-surface p-4">
          <h2 class="text-[17px] font-semibold">{{ t.evolution }}</h2>
          <div class="flex h-32 items-end gap-2" role="img" [attr.aria-label]="historyLabel()">
            @for (bar of history(); track bar.period; let last = $last) {
              <div class="flex flex-1 flex-col items-center justify-end gap-1">
                <div
                  class="w-full rounded-xl"
                  [class]="last ? 'bg-brand' : 'bg-brand-soft'"
                  [style.height.px]="bar.height"
                ></div>
                <span class="text-xs text-muted">{{ bar.label }}</span>
              </div>
            }
          </div>
        </section>
      }

      @if (pocket.kind === 'INVESTMENT') {
        <pl-valuation-history [pocketId]="pocket.id" [currency]="pocket.currency" />
      }

      <h2 class="text-lg font-bold">{{ t.movements }}</h2>
      @if (list.loaded() && list.items().length === 0) {
        <pl-empty-state icon="receipt" [heading]="t.empty" />
      } @else {
        <pl-movement-groups
          [movements]="list.items()"
          [baseCurrency]="base()"
          [pocketId]="pocket.id"
          (selected)="open($event)"
        />
        @if (list.hasMore()) {
          <button plButton="secondary" type="button" class="self-center" (click)="list.loadMore()">
            {{ t.loadMore }}
          </button>
        }
      }

      <section class="flex flex-col gap-2">
        @if (archiveError()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">
            {{ archiveError() }}
          </p>
        }
        <button
          plButton="ghost"
          type="button"
          class="self-center"
          [disabled]="archiving()"
          [plPlanGate]="restoreGate(pocket)"
          (click)="toggleArchive(pocket)"
        >
          {{ pocket.archived ? t.unarchive : t.archive }}
        </button>
        @if (!pocket.archived) {
          <p class="text-center text-xs text-muted">{{ t.archiveHint }}</p>
        }
      </section>
    } @else {
      <pl-skeleton [heights]="[180, 140, 72, 72]" />
    }
  `,
})
export class PocketDetailPage {
  readonly id = input.required<string>();

  protected readonly texts = ACCOUNTS_TEXTS;
  protected readonly t = ACCOUNTS_TEXTS.pocket;
  protected readonly icons = PL_POCKET_ICONS;
  protected readonly list = inject(MovementsList);
  private readonly store = inject(AccountsStore);
  private readonly auth = inject(AuthService);
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);
  private readonly today = inject(Today);
  private readonly hideAmounts = inject(HideAmounts);

  /** By id, so an archived pocket opens too. */
  protected readonly resource = httpResource<Pocket>(() => `${API}/pockets/${this.id()}`);
  protected readonly pocket = computed(() => this.resource.value());
  protected readonly base = computed(() => this.auth.user()?.baseCurrency ?? 'ARS');
  protected readonly actions = computed(() => {
    const pocket = this.pocket();
    return pocket ? ACTIONS[pocket.kind] : [];
  });
  protected readonly toneClass = computed(() => {
    const pocket = this.pocket();
    return PL_TONE_CLASSES[pocket ? PL_POCKET_ICONS[pocket.kind].tone : 'muted'];
  });
  protected readonly archiving = signal(false);
  protected readonly archiveError = signal<string | null>(null);

  /** Last six month-end balances as bars (negative balances draw as empty). */
  protected readonly history = computed(() => {
    const pocket = this.pocket();
    if (!pocket || !this.list.loaded()) return [];
    const rows = monthEndBalances(
      pocket.id,
      Money.of(pocket.balance, pocket.currency),
      this.list.items(),
      this.today.period(),
      6,
      !this.list.hasMore(),
    );
    // Numbers only to scale the bars; amounts stay in Money.
    const max = Math.max(...rows.map((r) => Number(r.balance.toString())), 1);
    return rows.map((r) => ({
      period: r.period,
      balance: r.balance,
      label: formatPeriodShort(r.period).slice(0, 3),
      height: Math.max(4, (Math.max(0, Number(r.balance.toString())) / max) * 96),
    }));
  });
  protected readonly historyLabel = computed(() =>
    this.t.evolutionLabel(
      this.history()
        .map(
          (bar) =>
            `${formatPeriodShort(bar.period)} ${moneyText(bar.balance.toString(), bar.balance.currency, this.hideAmounts.hidden())}`,
        )
        .join(', '),
    ),
  );

  constructor() {
    effect(() => void this.list.load({ pocketId: this.id() }));
    reloadOn(this.bus, ['accounts'], () => this.resource.reload());
  }

  /** Restoring a pocket makes it count again (PLN-05); an investment one needs the feature. */
  protected restoreGate(pocket: Pocket): PlanGateKey[] {
    if (!pocket.archived) return [];
    return pocket.kind === 'INVESTMENT' ? ['pockets', 'investments'] : ['pockets'];
  }

  protected move(intent: TransferIntent): void {
    const pocket = this.pocket();
    const account = this.store.byId(pocket?.accountId);
    if (pocket && account) {
      this.sheet.open(MoveSheet, {
        data: { account, intent, fromPocketId: pocket.id } satisfies MoveSheetData,
        ariaLabel: this.texts.move.titles[intent],
      });
    }
  }

  protected adjust(): void {
    const pocket = this.pocket();
    if (pocket) this.sheet.open(AdjustBalanceSheet, { data: pocket, ariaLabel: this.t.adjust });
  }

  protected edit(): void {
    const pocket = this.pocket();
    if (pocket) {
      this.sheet.open(PocketFormSheet, {
        data: { accountId: pocket.accountId, pocket } satisfies PocketFormData,
        ariaLabel: this.texts.pocketForm.editTitle,
      });
    }
  }

  protected async toggleArchive(pocket: Pocket): Promise<void> {
    this.archiving.set(true);
    this.archiveError.set(null);
    try {
      await this.store.updatePocket(pocket.id, { archived: !pocket.archived });
    } catch (error) {
      this.archiveError.set(errorMessage(error));
    } finally {
      this.archiving.set(false);
    }
  }

  protected open(movement: Movement): void {
    this.sheet.open(MovementSheet, { data: movement, ariaLabel: this.t.movements });
  }
}
