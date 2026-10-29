import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminPlanRequest } from '@platin/contracts';
import { PlButton, PlErrorState, PlSegmented, PlSegmentOption, PlSkeleton } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { AdminApi, formatInstant } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

type Status = AdminPlanRequest['status'];

/** ADM-06: plan change requests, approved or rejected from here. */
@Component({
  selector: 'pl-admin-requests-page',
  imports: [RouterLink, PlButton, PlSegmented, PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-5 text-2xl font-bold tracking-[-0.03em]">{{ t.title }}</h1>
    <pl-segmented
      class="mb-4 block max-w-md"
      [label]="t.status"
      [options]="options"
      [value]="status()"
      (valueChange)="status.set($event)"
    />
    @if (error()) {
      <p class="mb-4 rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
    }
    @if (failed()) {
      <pl-error-state [heading]="loadError" (retry)="load()" />
    } @else if (requests() === null) {
      <pl-skeleton [heights]="[88, 88]" />
    } @else if (requests()?.length === 0) {
      <p class="rounded-card bg-surface px-5 py-10 text-center text-muted">{{ t.empty }}</p>
    } @else {
      <ul class="flex flex-col gap-3">
        @for (request of requests(); track request.id) {
          <li class="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-5">
            <div class="flex min-w-0 flex-col gap-1">
              <a
                class="font-semibold break-all hover:text-brand-strong"
                [routerLink]="['/admin/usuarios', request.userId]"
                >{{ t.wants(request.userEmail ?? request.userId, request.planName) }}</a
              >
              <span class="text-sm text-muted">
                {{ t.current(request.currentPlanName ?? '—') }} · {{ when(request.createdAt) }}
              </span>
              @if (request.message) {
                <p class="text-[15px]">“{{ request.message }}”</p>
              }
            </div>
            @if (request.status === 'PENDING') {
              <div class="flex gap-2">
                <button
                  plButton="secondary"
                  type="button"
                  [disabled]="busy()"
                  (click)="decide(request, false)"
                >
                  {{ t.reject }}
                </button>
                <button plButton type="button" [disabled]="busy()" (click)="decide(request, true)">
                  {{ t.approve }}
                </button>
              </div>
            } @else {
              <span
                class="rounded-full px-3 py-1 text-sm font-semibold"
                [class]="request.status === 'APPROVED' ? 'bg-brand-soft' : 'bg-field'"
                >{{ request.status === 'APPROVED' ? t.approved : t.rejected }}</span
              >
            }
          </li>
        }
      </ul>
    }
  `,
})
export class AdminRequestsPage {
  private readonly api = inject(AdminApi);
  protected readonly t = ADMIN_TEXTS.requests;
  protected readonly loadError = ADMIN_TEXTS.loadError;
  protected readonly when = formatInstant;
  protected readonly status = signal<Status>('PENDING');
  protected readonly requests = signal<AdminPlanRequest[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly options: PlSegmentOption<Status>[] = (
    ['PENDING', 'APPROVED', 'REJECTED'] as const
  ).map((value) => ({ value, label: ADMIN_TEXTS.requests.statusNames[value] }));

  constructor() {
    effect(() => {
      this.status();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    this.requests.set(null);
    try {
      this.requests.set(await this.api.planRequests(this.status()));
    } catch {
      this.failed.set(true);
    }
  }

  protected async decide(request: AdminPlanRequest, approve: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.decidePlanRequest(request.id, approve);
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
