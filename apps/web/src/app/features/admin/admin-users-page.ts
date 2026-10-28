import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminUser, UserStatus } from '@platin/contracts';
import { PlButton, PlErrorState, PlSegmented, PlSegmentOption, PlSkeleton } from '@platin/web-ui';
import { INPUT_CLASS } from '../../core/forms/form-field';
import { AdminApi, formatInstant } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

type StatusFilter = UserStatus | 'ALL';

/** ADM-03: users with search, status filter and "ver más" (cursor). */
@Component({
  selector: 'pl-admin-users-page',
  imports: [RouterLink, PlButton, PlSegmented, PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-5 text-2xl font-bold tracking-[-0.03em]">{{ t.title }}</h1>
    <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
      <label class="flex flex-1 flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t.search }}</span>
        <input
          type="search"
          [class]="input"
          [placeholder]="t.searchPlaceholder"
          [value]="query()"
          (input)="onSearch($event)"
        />
      </label>
      <pl-segmented
        class="md:w-80"
        [label]="t.status"
        [options]="statusOptions"
        [value]="status()"
        (valueChange)="status.set($event)"
      />
    </div>

    @if (failed()) {
      <pl-error-state [heading]="loadError" (retry)="load(true)" />
    } @else if (users() === null) {
      <pl-skeleton [heights]="[56, 56, 56, 56]" />
    } @else if (users()?.length === 0) {
      <p class="rounded-card bg-surface px-5 py-10 text-center text-muted">{{ t.empty }}</p>
    } @else {
      <div class="overflow-hidden rounded-card bg-surface">
        <table class="w-full text-left text-[15px]">
          <thead class="hidden border-b border-line-soft text-sm text-muted md:table-header-group">
            <tr>
              <th scope="col" class="px-4 py-3 font-medium">{{ t.columns.user }}</th>
              <th scope="col" class="px-4 py-3 font-medium">{{ t.columns.createdAt }}</th>
              <th scope="col" class="px-4 py-3 font-medium">{{ t.columns.lastSeen }}</th>
              <th scope="col" class="px-4 py-3 font-medium">{{ t.columns.status }}</th>
            </tr>
          </thead>
          <tbody>
            @for (user of users(); track user.id) {
              <tr
                class="flex flex-col border-b border-line-soft px-4 py-3 last:border-b-0 md:table-row md:p-0"
              >
                <td class="md:px-4 md:py-3">
                  <a
                    [routerLink]="['/admin/usuarios', user.id]"
                    class="flex min-h-11 flex-col justify-center hover:text-brand-strong"
                  >
                    <span class="font-semibold">
                      {{ user.email }}
                      @if (user.role === 'ADMIN') {
                        <span class="ml-1 rounded-full bg-card-soft px-2 py-0.5 text-xs">{{
                          t.admin
                        }}</span>
                      }
                    </span>
                    @if (user.name) {
                      <span class="text-sm text-muted">{{ user.name }}</span>
                    }
                  </a>
                </td>
                <td class="font-amount text-sm md:px-4 md:py-3">
                  <span class="text-muted md:hidden">{{ t.columns.createdAt }}: </span>
                  {{ when(user.createdAt) }}
                </td>
                <td class="font-amount text-sm md:px-4 md:py-3">
                  <span class="text-muted md:hidden">{{ t.columns.lastSeen }}: </span>
                  {{ when(user.lastSeenAt) ?? t.never }}
                </td>
                <td class="pt-1 md:px-4 md:py-3">
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-semibold"
                    [class]="user.status === 'ACTIVE' ? 'bg-brand-soft' : 'bg-expense-soft'"
                    >{{ t.statusNames[user.status] }}</span
                  >
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (nextCursor()) {
        <button
          plButton="secondary"
          type="button"
          class="mx-auto mt-4 flex"
          [disabled]="loading()"
          (click)="load(false)"
        >
          {{ t.loadMore }}
        </button>
      }
    }
  `,
})
export class AdminUsersPage {
  private readonly api = inject(AdminApi);
  protected readonly t = ADMIN_TEXTS.users;
  protected readonly loadError = ADMIN_TEXTS.loadError;
  protected readonly input = INPUT_CLASS;
  protected readonly when = formatInstant;

  protected readonly query = signal('');
  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly users = signal<AdminUser[] | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly statusOptions: PlSegmentOption<StatusFilter>[] = [
    { value: 'ALL', label: ADMIN_TEXTS.users.all },
    { value: 'ACTIVE', label: ADMIN_TEXTS.users.active },
    { value: 'SUSPENDED', label: ADMIN_TEXTS.users.suspended },
  ];

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private request = 0;

  constructor() {
    effect(() => {
      this.query();
      this.status();
      untracked(() => void this.load(true));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.query.set(value.trim()), 300);
  }

  protected async load(reset: boolean): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.failed.set(false);
    if (reset) this.users.set(null);
    try {
      const status = this.status();
      const page = await this.api.users({
        query: this.query() || undefined,
        status: status === 'ALL' ? undefined : status,
        cursor: reset ? undefined : (this.nextCursor() ?? undefined),
      });
      // A newer search already started: drop this answer.
      if (request !== this.request) return;
      this.users.update((current) => (reset ? page.items : [...(current ?? []), ...page.items]));
      this.nextCursor.set(page.nextCursor);
    } catch {
      if (request === this.request) this.failed.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
}
