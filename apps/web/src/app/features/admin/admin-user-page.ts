import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import type { AdminUserDetail } from '@platin/contracts';
import { PlBottomSheet, PlButton, PlErrorState, PlSkeleton } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { AdminConfirmData, AdminConfirmSheet } from './admin-confirm-sheet';
import { ADMIN_API, AdminApi, formatInstant, UserAction } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

type CountKey = keyof AdminUserDetail['counts'];

/** ADM-03/04: account data, record counts and the actions on a user. */
@Component({
  selector: 'pl-admin-user-page',
  imports: [RouterLink, LucideArrowLeft, PlButton, PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/admin/usuarios"
      class="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink"
    >
      <svg lucideArrowLeft [size]="16"></svg> {{ t.back }}
    </a>
    @if (detail.error()) {
      <pl-error-state [heading]="loadError" (retry)="detail.reload()" />
    } @else if (user(); as u) {
      <h1 class="text-2xl font-bold tracking-[-0.03em] break-all">{{ u.email }}</h1>
      <p class="mb-5 text-muted">{{ u.name ?? t.noName }}</p>

      @if (notice()) {
        <p class="mb-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">
          {{ notice() }}
        </p>
      }
      @if (error()) {
        <p class="mb-4 rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      <div class="grid gap-4 md:grid-cols-2">
        <section class="rounded-card bg-surface p-5" aria-labelledby="account-title">
          <h2 id="account-title" class="mb-2 text-lg font-bold">{{ t.account }}</h2>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt class="text-muted">{{ t.role }}</dt>
            <dd>{{ t.roles[u.role] }}</dd>
            <dt class="text-muted">{{ statusLabel }}</dt>
            <dd>{{ statusNames[u.status] }}</dd>
            <dt class="text-muted">{{ t.createdAt }}</dt>
            <dd class="font-amount">{{ when(u.createdAt) }}</dd>
            <dt class="text-muted">{{ t.lastSeen }}</dt>
            <dd class="font-amount">{{ when(u.lastSeenAt) ?? never }}</dd>
            <dt class="text-muted">{{ t.sessions }}</dt>
            <dd class="font-amount">{{ u.activeSessions }}</dd>
          </dl>
        </section>

        <section class="rounded-card bg-surface p-5" aria-labelledby="records-title">
          <h2 id="records-title" class="text-lg font-bold">{{ t.records }}</h2>
          <p class="mb-2 text-sm text-muted">{{ t.recordsHint }}</p>
          <dl class="grid grid-cols-[1fr_auto] gap-y-1.5 text-[15px]">
            @for (key of countKeys; track key) {
              <dt>{{ t.counts[key] }}</dt>
              <dd class="font-amount text-right font-semibold">{{ u.counts[key] }}</dd>
            }
          </dl>
        </section>
      </div>

      <section class="mt-4 rounded-card bg-surface p-5" aria-labelledby="actions-title">
        <h2 id="actions-title" class="mb-3 text-lg font-bold">{{ t.actions }}</h2>
        @if (isSelf()) {
          <p class="mb-3 text-sm text-muted">{{ t.self }}</p>
        }
        <div class="flex flex-wrap gap-2">
          @if (u.status === 'ACTIVE') {
            <button
              plButton="secondary"
              type="button"
              [disabled]="busy() || isSelf()"
              (click)="run('suspend')"
            >
              {{ t.suspend }}
            </button>
          } @else {
            <button
              plButton="secondary"
              type="button"
              [disabled]="busy()"
              (click)="run('reactivate')"
            >
              {{ t.reactivate }}
            </button>
          }
          <button plButton="secondary" type="button" [disabled]="busy()" (click)="run('logout')">
            {{ t.logout }}
          </button>
          <button
            plButton="danger"
            type="button"
            [disabled]="busy() || isSelf()"
            (click)="remove()"
          >
            {{ t.delete }}
          </button>
        </div>
      </section>
    } @else {
      <pl-skeleton [heights]="[60, 220, 120]" />
    }
  `,
})
export class AdminUserPage {
  readonly id = input.required<string>();

  private readonly api = inject(AdminApi);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly t = ADMIN_TEXTS.user;
  protected readonly statusLabel = ADMIN_TEXTS.users.columns.status;
  protected readonly statusNames = ADMIN_TEXTS.users.statusNames;
  protected readonly never = ADMIN_TEXTS.users.never;
  protected readonly loadError = ADMIN_TEXTS.loadError;
  protected readonly when = formatInstant;
  protected readonly countKeys = Object.keys(ADMIN_TEXTS.user.counts) as CountKey[];

  protected readonly detail = httpResource<AdminUserDetail>(
    () => `${ADMIN_API}/users/${this.id()}`,
  );
  private readonly updated = signal<AdminUserDetail | null>(null);
  protected readonly user = computed(() => {
    const fresh = this.updated();
    return fresh?.id === this.id() ? fresh : this.detail.value();
  });
  protected readonly isSelf = computed(() => this.auth.user()?.id === this.id());
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async run(action: UserAction): Promise<void> {
    const user = this.user();
    if (!user) return;
    const messages: Record<UserAction, string> = {
      suspend: this.t.confirmSuspend(user.email),
      reactivate: this.t.confirmReactivate(user.email),
      logout: this.t.confirmLogout(user.email),
    };
    const labels: Record<UserAction, string> = {
      suspend: this.t.suspend,
      reactivate: this.t.reactivate,
      logout: this.t.logout,
    };
    const ok = await this.confirm({
      heading: labels[action],
      message: messages[action],
      confirmLabel: labels[action],
      danger: action === 'suspend',
    });
    if (ok === undefined) return;
    await this.attempt(async () => {
      this.updated.set(await this.api.userAction(user.id, action));
      this.notice.set(this.t.done[action]);
    });
  }

  protected async remove(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const typed = await this.confirm({
      heading: this.t.delete,
      message: this.t.confirmDelete(user.email),
      confirmLabel: this.t.delete,
      danger: true,
      typeToConfirm: { label: this.t.confirmDeleteLabel, expected: user.email },
    });
    if (typed === undefined) return;
    await this.attempt(async () => {
      await this.api.deleteUser(user.id, typed);
      await this.router.navigateByUrl('/admin/usuarios');
    });
  }

  private confirm(data: AdminConfirmData): Promise<string | undefined> {
    const ref = this.sheet.open<AdminConfirmSheet, AdminConfirmData, string>(AdminConfirmSheet, {
      data,
      ariaLabel: data.heading,
    });
    return firstValueFrom(ref.closed);
  }

  private async attempt(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.notice.set(null);
    this.error.set(null);
    try {
      await work();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
