import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import type { AdminPlan, AdminUserDetail } from '@platin/contracts';
import { addDays, localDateAt, type LocalDate } from '@platin/domain';
import {
  formatDate,
  PlButton,
  PlDateField,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { AdminApi } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

type Duration = 'forever' | '30' | 'until';

/** PLN-06: the user's plan and the form to change it, with an optional expiry. */
@Component({
  selector: 'pl-admin-user-plan',
  imports: [PlButton, PlSelect, PlSegmented, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-card bg-surface p-5' },
  template: `
    <h2 class="text-lg font-bold">{{ t.title }}</h2>
    <p class="text-[15px]">
      <span class="font-semibold">{{ user().plan.name }}</span>
      <span class="text-muted">
        · {{ t.sources[user().plan.source] }} ·
        {{ user().plan.endsAt ? t.until(lastDay(user().plan.endsAt!)) : t.noExpiry }}
      </span>
    </p>
    <div class="grid gap-3 md:grid-cols-2">
      <pl-form-field [label]="t.plan" controlId="assign-plan">
        <pl-select
          inputId="assign-plan"
          [label]="t.plan"
          [options]="options()"
          [value]="planId()"
          (valueChange)="planId.set($event)"
        />
      </pl-form-field>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ t.duration }}</span>
        <pl-segmented
          [label]="t.duration"
          [options]="durations"
          [value]="duration()"
          (valueChange)="duration.set($event)"
        />
      </div>
    </div>
    @if (duration() === 'until') {
      <pl-form-field [label]="t.lastDay" controlId="assign-last-day" class="md:max-w-xs">
        <pl-date-field
          inputId="assign-last-day"
          [label]="t.lastDay"
          [min]="today()"
          [value]="untilDate()"
          (valueChange)="untilDate.set($event)"
        />
      </pl-form-field>
    }
    @if (error()) {
      <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
    }
    @if (done()) {
      <p class="rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">{{ t.assigned }}</p>
    }
    <button
      plButton
      type="button"
      class="self-start"
      [disabled]="saving() || !planId() || (duration() === 'until' && !untilDate())"
      (click)="assign()"
    >
      {{ t.assign }}
    </button>
  `,
})
export class AdminUserPlan implements OnInit {
  readonly user = input.required<AdminUserDetail>();
  readonly changed = output<AdminUserDetail>();

  private readonly api = inject(AdminApi);
  protected readonly today = inject(Today).date;
  protected readonly t = ADMIN_TEXTS.userPlan;
  protected readonly durations: PlSegmentOption<Duration>[] = [
    { value: 'forever', label: ADMIN_TEXTS.userPlan.forever },
    { value: '30', label: ADMIN_TEXTS.userPlan.days30 },
    { value: 'until', label: ADMIN_TEXTS.userPlan.until_ },
  ];

  private readonly plans = signal<AdminPlan[]>([]);
  protected readonly options = computed<PlSelectOption<string>[]>(() =>
    this.plans()
      .filter((plan) => !plan.archived)
      .map((plan) => ({ value: plan.id, label: plan.name })),
  );
  protected readonly planId = signal<string | null>(null);
  protected readonly duration = signal<Duration>('forever');
  protected readonly untilDate = signal<LocalDate | null>(null);
  protected readonly saving = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.plans.set(await this.api.plans());
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  /** endsAt is the first instant it no longer applies: the last day is the one before. */
  protected lastDay(endsAt: string): string {
    return formatDate(localDateAt(new Date(new Date(endsAt).getTime() - 1)));
  }

  protected async assign(): Promise<void> {
    const planId = this.planId();
    if (!planId) return;
    const lastDay =
      this.duration() === 'forever'
        ? null
        : this.duration() === '30'
          ? addDays(this.today(), 30)
          : this.untilDate();
    this.saving.set(true);
    this.done.set(false);
    this.error.set(null);
    try {
      this.changed.emit(await this.api.assignPlan(this.user().id, { planId, lastDay }));
      this.done.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
