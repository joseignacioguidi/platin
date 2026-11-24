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
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideTrash2 } from '@lucide/angular';
import type { FeedReserve, HeldMovement } from '@platin/contracts';
import { localDateAt, parseLocalDate } from '@platin/domain';
import {
  formatDate,
  PlBottomSheet,
  PlButton,
  PlMoney,
  PlPlanBadge,
  PlSelect,
  type PlSelectOption,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { AccountsStore } from '../accounts/accounts.store';
import { PROFILE_GROUP } from '../settings/profile-group';
import { FeedAccountSheet } from './feed-account-sheet';
import { FeedsStore } from './feeds.store';
import { FEEDS_TEXTS } from './feeds.texts';

/**
 * Perfil › Mercado Pago (MPG-01, 05, 07, 09, 10): the connection, its account, today's usage
 * with the plan's mark, the reserves and "Para revisar". The API sends the browser back here
 * after authorizing, with `?conectado=1` or `?error=CODE`.
 */
@Component({
  selector: 'pl-mercado-pago-page',
  imports: [PlButton, PlMoney, PlPlanBadge, PlSelect, RouterLink, LucideArrowLeft, LucideTrash2],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2.5 lg:max-w-3xl lg:gap-5' },
  template: `
    <a
      routerLink="/app/perfil"
      class="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold text-muted"
    >
      <svg lucideArrowLeft [size]="18" aria-hidden="true"></svg>{{ t.back }}
    </a>
    <h1 class="mx-1 text-2xl font-extrabold lg:mx-0 lg:text-3xl">{{ t.title }}</h1>

    @if (notice(); as notice) {
      <p
        class="rounded-2xl px-4 py-3 text-sm"
        [class.bg-brand-soft]="notice.ok"
        [class.bg-expense-soft]="!notice.ok"
        role="status"
      >
        {{ notice.text }}
      </p>
    }

    @if (store.resource.hasValue() && !store.mercadoPago()) {
      <p class="rounded-2xl bg-surface px-4 py-3 text-sm text-muted">{{ t.errors['default'] }}</p>
    }

    @if (store.mercadoPago(); as mp) {
      <section [class]="group.section" aria-labelledby="mp-status-title">
        <h2 id="mp-status-title" [class]="group.title">{{ t.connectionTitle }}</h2>
        <div [class]="group.body">
          <p class="text-[15px]">{{ status() }}</p>
          @if (connection()?.lastEventAt; as last) {
            <p class="text-[13px] text-muted">{{ t.lastEvent(when(last)) }}</p>
          }
          @if (!connection()) {
            <p class="text-[15px] text-muted">{{ t.intro }}</p>
          }
          <div class="flex flex-wrap gap-2">
            @if (!connection() || connection()?.status === 'NEEDS_RECONNECT') {
              <button plButton type="button" [disabled]="busy()" (click)="connect()">
                {{ busy() ? t.connecting : connection() ? t.reconnect : t.connect }}
              </button>
            }
            @if (connection() && connection()?.status !== 'NEEDS_RECONNECT') {
              <button plButton="secondary" type="button" (click)="chooseAccount()">
                {{ connection()?.account ? t.account.change : t.account.choose }}
              </button>
            }
            @if (connection() && !confirming()) {
              <button
                plButton="danger"
                type="button"
                class="text-expense-ink!"
                (click)="confirming.set(true)"
              >
                {{ t.disconnect }}
              </button>
            }
          </div>
          @if (confirming()) {
            <div class="flex flex-col gap-2 rounded-2xl border border-expense p-4">
              <p class="text-[15px] font-semibold">{{ t.disconnectConfirm }}</p>
              <p class="text-sm text-muted">{{ t.disconnectBody }}</p>
              <div class="grid grid-cols-2 gap-2">
                <button plButton="secondary" type="button" (click)="confirming.set(false)">
                  {{ t.cancel }}
                </button>
                <button plButton="danger" type="button" [disabled]="busy()" (click)="disconnect()">
                  {{ t.disconnectYes }}
                </button>
              </div>
            </div>
          }
          @if (connection()?.account; as account) {
            <p class="rounded-2xl bg-field px-4 py-3 text-sm text-muted">
              {{ t.notBrought }}
              <a
                class="font-semibold text-ink underline"
                [routerLink]="['/app/cuentas', account.id]"
              >
                {{ t.adjustBalance }}
              </a>
            </p>
          }
          @if (failure()) {
            <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">
              {{ failure() }}
            </p>
          }
        </div>
      </section>

      @if (connection()) {
        <!-- MPG-07: today's usage, with the plan's mark when there is a limit. -->
        <section [class]="group.section" aria-labelledby="mp-usage-title">
          <h2 id="mp-usage-title" [class]="group.title">{{ t.usage.title }}</h2>
          <div [class]="group.body">
            <p class="flex items-center gap-2 text-[15px]">
              <span class="font-amount">{{ t.usage.used(mp.usage.created, mp.usage.limit) }}</span>
              @if (mp.usage.limit !== null) {
                <pl-plan-badge plan="Pro" />
              }
            </p>
            @if (mp.usage.overLimit > 0) {
              <p class="text-sm text-pending-ink">
                {{ t.usage.over(mp.usage.overLimit) }}
                <a class="font-semibold underline" routerLink="/planes">{{ t.usage.seePlans }}</a>
              </p>
            }
          </div>
        </section>

        <section [class]="group.section" aria-labelledby="mp-held-title">
          <h2 id="mp-held-title" [class]="group.title">{{ t.held.title }}</h2>
          <div [class]="group.body">
            <p class="text-[13px] text-muted">{{ t.held.hint }}</p>
            @if (held().length === 0) {
              <p class="text-sm text-muted">{{ t.held.empty }}</p>
            } @else {
              <ul class="flex flex-col divide-y divide-line-soft">
                @for (item of held(); track item.id) {
                  <li class="flex min-h-14 items-center gap-2 py-2">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[15px]">
                        {{ t.held.kinds[item.kind] }} · {{ item.reserve?.name ?? item.description }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ day(item.date) }} · {{ t.held.reasons[item.holdReason] }}
                      </p>
                    </div>
                    <pl-money
                      class="font-amount"
                      [amount]="item.amount"
                      [currency]="item.currency"
                    />
                    <button
                      plButton="ghost"
                      size="icon"
                      type="button"
                      [attr.aria-label]="t.held.dismiss(item.description)"
                      (click)="dismiss(item)"
                    >
                      <svg lucideTrash2 [size]="18" aria-hidden="true"></svg>
                    </button>
                  </li>
                }
              </ul>
              <button plButton="secondary" type="button" class="self-start" (click)="retry()">
                {{ t.held.retry }}
              </button>
              @if (retried()) {
                <p class="text-sm text-muted" role="status">{{ retried() }}</p>
              }
            }
          </div>
        </section>

        <section [class]="group.section" aria-labelledby="mp-reserves-title">
          <h2 id="mp-reserves-title" [class]="group.title">{{ t.reserves.title }}</h2>
          <div [class]="group.body">
            <p class="text-[13px] text-muted">{{ t.reserves.hint }}</p>
            @if (reserves().length === 0) {
              <p class="text-sm text-muted">{{ t.reserves.empty }}</p>
            }
            @for (reserve of reserves(); track reserve.id) {
              <div
                class="flex flex-col gap-1.5 border-t border-line-soft pt-3 first:border-0 first:pt-0"
              >
                <p class="text-[15px] font-semibold">{{ reserve.name }} · {{ reserve.currency }}</p>
                @if (reserve.heldCount > 0) {
                  <p class="text-xs text-pending-ink">
                    {{ t.reserves.waiting(reserve.heldCount) }}
                  </p>
                }
                @if (pocketOptions(reserve).length > 0) {
                  <pl-select
                    [label]="t.reserves.pick + ': ' + reserve.name"
                    [placeholder]="t.reserves.unassigned"
                    [options]="pocketOptions(reserve)"
                    [value]="reserve.pocket?.id ?? null"
                    (valueChange)="assign(reserve, $event)"
                  />
                } @else if (connection()?.account; as account) {
                  <p class="text-sm text-muted">
                    {{ t.reserves.noPockets(reserve.currency) }}
                    <a
                      class="font-semibold text-ink underline"
                      [routerLink]="['/app/cuentas', account.id]"
                    >
                      {{ t.reserves.createPocket }}
                    </a>
                  </p>
                }
              </div>
            }
          </div>
        </section>
      }
    }
  `,
})
export class MercadoPagoPage {
  /** Set by the API after the callback. */
  readonly conectado = input<string>();
  readonly error = input<string>();

  protected readonly t = FEEDS_TEXTS;
  protected readonly group = PROFILE_GROUP;
  protected readonly store = inject(FeedsStore);
  private readonly accounts = inject(AccountsStore);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);

  protected readonly connection = this.store.connection;
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly confirming = signal(false);
  protected readonly retried = signal('');
  protected readonly held = computed(() => this.store.held.value() ?? []);
  protected readonly reserves = computed(() => this.store.reserves.value() ?? []);

  protected readonly notice = computed(() => {
    const code = this.error();
    if (code) return { ok: false, text: this.t.errors[code] ?? this.t.errors['default'] };
    return this.conectado() ? { ok: true, text: this.t.connectedOk } : null;
  });

  protected readonly status = computed(() => {
    const connection = this.connection();
    if (!connection) return this.t.notConnected;
    if (connection.status === 'NEEDS_RECONNECT') return this.t.needsReconnect;
    if (!connection.account) return this.t.needsAccount;
    return this.t.connected(connection.account.name);
  });

  constructor() {
    // Back from Mercado Pago without an account yet: ask for it right away.
    let asked = false;
    effect(() => {
      const connection = this.connection();
      if (asked || !this.conectado() || connection?.status !== 'NEEDS_ACCOUNT') return;
      asked = true;
      untracked(() => this.chooseAccount());
    });
  }

  protected chooseAccount(): void {
    this.sheet.open(FeedAccountSheet, { ariaLabel: this.t.account.title });
  }

  protected async connect(): Promise<void> {
    await this.run(async () => {
      const url = await this.store.connect();
      window.location.assign(url);
    });
  }

  protected async disconnect(): Promise<void> {
    await this.run(async () => {
      await this.store.disconnect();
      this.confirming.set(false);
      await this.router.navigate([], { queryParams: {} });
    });
  }

  protected async assign(reserve: FeedReserve, pocketId: string | null): Promise<void> {
    if (!pocketId || pocketId === reserve.pocket?.id) return;
    await this.run(() => this.store.assignReserve(reserve.id, pocketId));
  }

  protected async retry(): Promise<void> {
    await this.run(async () => {
      const result = await this.store.retryHeld();
      this.retried.set(this.t.held.retried(result.applied, result.held));
    });
  }

  protected async dismiss(item: HeldMovement): Promise<void> {
    await this.run(() => this.store.dismissHeld(item.id));
  }

  /** Reserves of the connected account in that currency (never its balance). */
  protected pocketOptions(reserve: FeedReserve): PlSelectOption[] {
    const account = this.accounts.byId(this.connection()?.account?.id);
    return (account?.pockets ?? [])
      .filter((p) => p.kind !== 'AVAILABLE' && !p.archived && p.currency === reserve.currency)
      .map((p) => ({ value: p.id, label: p.name }));
  }

  protected when(instant: string): string {
    return formatDate(localDateAt(new Date(instant)));
  }

  protected day(date: string): string {
    return formatDate(parseLocalDate(date));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      await action();
    } catch (error) {
      this.failure.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
