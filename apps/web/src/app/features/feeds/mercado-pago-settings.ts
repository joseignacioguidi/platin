import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideWallet } from '@lucide/angular';
import { PlButton } from '@platin/web-ui';
import { PROFILE_GROUP } from '../settings/profile-group';
import { FeedsStore } from './feeds.store';
import { FEEDS_TEXTS } from './feeds.texts';

/**
 * AUTH-10, group 5: the state of the Mercado Pago connection in one row, with the way to its
 * screen. Hidden when the server has no Mercado Pago credentials.
 */
@Component({
  selector: 'pl-mercado-pago-settings',
  imports: [PlButton, RouterLink, LucideWallet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.mercadoPago()) {
      <section [class]="group.section" aria-labelledby="mercado-pago-title">
        <h2 id="mercado-pago-title" [class]="group.title">{{ t.title }}</h2>
        <div [class]="group.body">
          <div class="flex flex-wrap items-center gap-3">
            <span
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transfer-soft text-transfer"
              aria-hidden="true"
            >
              <svg lucideWallet [size]="20"></svg>
            </span>
            <div class="flex min-w-0 flex-[1_1_12rem] flex-col">
              <p class="text-sm text-muted">{{ status() }}</p>
              @if (summary()) {
                <p class="text-sm font-semibold text-pending-ink">{{ summary() }}</p>
              }
            </div>
            <a
              [plButton]="store.connection() ? 'secondary' : 'primary'"
              size="sm"
              routerLink="/app/perfil/mercado-pago"
            >
              {{ store.connection() ? t.open : t.connect }}
            </a>
          </div>
          @if (!store.connection()) {
            <p class="text-[15px] text-muted">{{ t.intro }}</p>
          }
        </div>
      </section>
    }
  `,
})
export class MercadoPagoSettings {
  protected readonly t = FEEDS_TEXTS;
  protected readonly group = PROFILE_GROUP;
  protected readonly store = inject(FeedsStore);

  protected readonly status = computed(() => {
    const connection = this.store.connection();
    if (!connection) return this.t.notConnected;
    if (connection.status === 'NEEDS_RECONNECT') return this.t.needsReconnect;
    if (connection.status === 'NEEDS_ACCOUNT' || !connection.account) return this.t.needsAccount;
    return this.t.connected(connection.account.name);
  });
  protected readonly summary = computed(() =>
    this.t.summary(this.store.connection()?.heldCount ?? 0),
  );
}
