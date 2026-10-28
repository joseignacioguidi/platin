import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AuditEntry } from '@platin/contracts';
import { PlButton, PlErrorState, PlSkeleton } from '@platin/web-ui';
import { AdminApi } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

/** ADM-07: who did what, when and to whom, newest first. */
@Component({
  selector: 'pl-admin-audit-page',
  imports: [RouterLink, PlButton, PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-5 text-2xl font-bold tracking-[-0.03em]">{{ t.title }}</h1>
    @if (failed()) {
      <pl-error-state [heading]="loadError" (retry)="load(true)" />
    } @else if (entries() === null) {
      <pl-skeleton [heights]="[64, 64, 64]" />
    } @else if (entries()?.length === 0) {
      <p class="rounded-card bg-surface px-5 py-10 text-center text-muted">{{ t.empty }}</p>
    } @else {
      <ol class="rounded-card bg-surface px-2">
        @for (entry of entries(); track entry.id) {
          <li class="flex flex-col gap-0.5 border-b border-line-soft px-3 py-3 last:border-b-0">
            <span class="text-[15px]">
              {{ describe(entry) }}
              @if (entry.targetUserId) {
                @if (entry.action !== 'user.delete') {
                  <a
                    class="font-semibold underline-offset-2 hover:underline"
                    [routerLink]="['/admin/usuarios', entry.targetUserId]"
                    >{{ entry.targetEmail ?? entry.targetUserId }}</a
                  >
                } @else {
                  <span class="font-semibold">{{ entry.targetEmail ?? t.deletedUser }}</span>
                }
              }
            </span>
            <span class="font-amount text-xs text-muted">
              {{ timestamp(entry.createdAt) }} · {{ t.by(entry.actorEmail ?? entry.actorId) }}
            </span>
          </li>
        }
      </ol>
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
export class AdminAuditPage implements OnInit {
  private readonly api = inject(AdminApi);
  protected readonly t = ADMIN_TEXTS.audit;
  protected readonly loadError = ADMIN_TEXTS.loadError;
  protected readonly entries = signal<AuditEntry[] | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    void this.load(true);
  }

  protected async load(reset: boolean): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const page = await this.api.audit(reset ? null : this.nextCursor());
      this.entries.update((current) => (reset ? page.items : [...(current ?? []), ...page.items]));
      this.nextCursor.set(page.nextCursor);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected describe(entry: AuditEntry): string {
    const action = this.t.actions[entry.action] ?? entry.action;
    if (entry.action === 'setting.update') {
      const key = String(entry.payload['key'] ?? '');
      return `${action}: ${this.t.settingNames[key] ?? key}`;
    }
    const planName = entry.payload['planName'];
    return typeof planName === 'string' && !entry.targetUserId ? `${action} ${planName}` : action;
  }

  protected timestamp(iso: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date(iso));
  }
}
