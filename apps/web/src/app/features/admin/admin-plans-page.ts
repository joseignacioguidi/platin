import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import type { AdminPlan, PlanLimitsDto } from '@platin/contracts';
import { PlButton, PlErrorState, PlSkeleton } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { AdminApi } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

type LimitKey = Exclude<keyof PlanLimitsDto, 'investments'>;
const LIMIT_KEYS: LimitKey[] = ['maxAccounts', 'maxPockets', 'maxCards', 'maxGoals', 'maxFixed'];
const T = ADMIN_TEXTS.plans;

/** Form of a plan (new or existing). Limits are text so an empty field means unlimited. */
@Component({
  selector: 'pl-admin-plan-form',
  imports: [PlButton, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @if (!plan()) {
      <pl-form-field [label]="t.key" controlId="plan-key" [hint]="t.keyHint">
        <input id="plan-key" [class]="input" [value]="key()" (input)="key.set(text($event))" />
      </pl-form-field>
    }
    <div class="grid gap-3 sm:grid-cols-2">
      <pl-form-field [label]="t.name" [controlId]="id('name')">
        <input
          [id]="id('name')"
          [class]="input"
          [value]="name()"
          (input)="name.set(text($event))"
        />
      </pl-form-field>
      <pl-form-field [label]="t.price" [controlId]="id('price')" [hint]="t.priceHint">
        <input
          [id]="id('price')"
          inputmode="decimal"
          [class]="input + ' font-amount'"
          placeholder="0"
          [value]="price()"
          (input)="price.set(text($event))"
        />
      </pl-form-field>
    </div>
    <pl-form-field [label]="t.description" [controlId]="id('description')">
      <input
        [id]="id('description')"
        maxlength="200"
        [class]="input"
        [value]="description()"
        (input)="description.set(text($event))"
      />
    </pl-form-field>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-2 text-sm font-medium">{{ t.limits }}</legend>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (limit of limitKeys; track limit) {
          <pl-form-field [label]="t.limitNames[limit]" [controlId]="id(limit)">
            <input
              [id]="id(limit)"
              inputmode="numeric"
              [class]="input + ' font-amount'"
              [placeholder]="t.unlimited"
              [value]="limits()[limit]"
              (input)="setLimit(limit, text($event))"
            />
          </pl-form-field>
        }
      </div>
    </fieldset>

    <div class="flex flex-col gap-1">
      <label class="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          class="size-5 accent-brand"
          [checked]="investments()"
          (change)="investments.set(checked($event))"
        />
        {{ t.investments }}
      </label>
      <label class="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          class="size-5 accent-brand"
          [checked]="isPublic()"
          (change)="isPublic.set(checked($event))"
        />
        {{ t.isPublic }}
      </label>
      <pl-form-field [label]="t.sortOrder" [controlId]="id('order')" class="max-w-32">
        <input
          [id]="id('order')"
          inputmode="numeric"
          [class]="input + ' font-amount'"
          [value]="sortOrder()"
          (input)="sortOrder.set(text($event))"
        />
      </pl-form-field>
    </div>

    @if (error()) {
      <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
    }
    <div class="flex flex-wrap gap-2">
      <button plButton type="button" [disabled]="saving()" (click)="save()">
        {{ plan() ? t.save : t.create }}
      </button>
      <button plButton="secondary" type="button" (click)="cancelled.emit()">{{ t.cancel }}</button>
      @if (plan(); as plan) {
        @if (!plan.isDefault && !plan.archived) {
          <button
            plButton="secondary"
            type="button"
            [disabled]="saving()"
            (click)="patch({ isDefault: true })"
          >
            {{ t.makeDefault }}
          </button>
        }
        @if (!plan.isDefault) {
          <button
            plButton="secondary"
            type="button"
            [disabled]="saving()"
            (click)="patch({ archived: !plan.archived })"
          >
            {{ plan.archived ? t.unarchive : t.archive }}
          </button>
        }
      }
    </div>
  `,
})
export class AdminPlanForm implements OnInit {
  readonly plan = input<AdminPlan | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  private readonly api = inject(AdminApi);
  protected readonly t = T;
  protected readonly input = INPUT_CLASS;
  protected readonly limitKeys = LIMIT_KEYS;

  protected readonly key = signal('');
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly price = signal('');
  protected readonly limits = signal<Record<LimitKey, string>>({
    maxAccounts: '',
    maxPockets: '',
    maxCards: '',
    maxGoals: '',
    maxFixed: '',
  });
  protected readonly investments = signal(false);
  protected readonly isPublic = signal(true);
  protected readonly sortOrder = signal('0');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const plan = this.plan();
    if (!plan) return;
    this.name.set(plan.name);
    this.description.set(plan.description);
    this.price.set(plan.priceArs ?? '');
    this.limits.set(
      Object.fromEntries(
        LIMIT_KEYS.map((key) => [key, plan.limits[key] === null ? '' : String(plan.limits[key])]),
      ) as Record<LimitKey, string>,
    );
    this.investments.set(plan.limits.investments);
    this.isPublic.set(plan.isPublic);
    this.sortOrder.set(String(plan.sortOrder));
  }

  protected id(field: string): string {
    return `plan-${this.plan()?.id ?? 'new'}-${field}`;
  }

  protected setLimit(key: LimitKey, value: string): void {
    this.limits.update((limits) => ({ ...limits, [key]: value }));
  }

  protected async save(): Promise<void> {
    const limits = this.parseLimits();
    const sortOrder = Number(this.sortOrder() || '0');
    if (!limits || !Number.isInteger(sortOrder)) {
      this.error.set(T.invalidNumber);
      return;
    }
    const fields = {
      name: this.name().trim(),
      description: this.description().trim(),
      priceArs: this.price().trim().replace(',', '.') || null,
      limits,
      isPublic: this.isPublic(),
      sortOrder,
    };
    const plan = this.plan();
    await this.run(() =>
      plan
        ? this.api.updatePlan(plan.id, fields)
        : this.api.createPlan({ ...fields, key: this.key().trim() }),
    );
  }

  protected patch(changes: { isDefault?: true; archived?: boolean }): Promise<void> {
    const plan = this.plan();
    return plan ? this.run(() => this.api.updatePlan(plan.id, changes)) : Promise.resolve();
  }

  private async run(work: () => Promise<unknown>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await work();
      this.saved.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private parseLimits(): PlanLimitsDto | null {
    const result: Partial<PlanLimitsDto> = { investments: this.investments() };
    for (const key of LIMIT_KEYS) {
      const raw = this.limits()[key].trim();
      if (raw === '') {
        result[key] = null;
        continue;
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0) return null;
      result[key] = value;
    }
    return result as PlanLimitsDto;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}

/** PLN-01/02: plans with their limits, features, reference price, visibility and order. */
@Component({
  selector: 'pl-admin-plans-page',
  imports: [AdminPlanForm, PlButton, PlSkeleton, PlErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold tracking-[-0.03em]">{{ t.title }}</h1>
      @if (editing() !== 'new') {
        <button plButton type="button" (click)="editing.set('new')">{{ t.newPlan }}</button>
      }
    </div>
    <p class="mb-4 text-sm text-muted">{{ t.intro }}</p>

    @if (editing() === 'new') {
      <section class="mb-4 rounded-card bg-surface p-5" [attr.aria-label]="t.newPlan">
        <h2 class="mb-3 text-lg font-bold">{{ t.newPlan }}</h2>
        <pl-admin-plan-form (saved)="reload()" (cancelled)="editing.set(null)" />
      </section>
    }

    @if (failed()) {
      <pl-error-state [heading]="loadError" (retry)="reload()" />
    } @else if (plans(); as plans) {
      <ul class="flex flex-col gap-3">
        @for (plan of plans; track plan.id) {
          <li class="rounded-card bg-surface p-5" [class.opacity-70]="plan.archived">
            @if (editing() === plan.id) {
              <h2 class="mb-3 text-lg font-bold">{{ plan.name }}</h2>
              <pl-admin-plan-form
                [plan]="plan"
                (saved)="reload()"
                (cancelled)="editing.set(null)"
              />
            } @else {
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex flex-col gap-1">
                  <h2 class="flex flex-wrap items-center gap-2 text-lg font-bold">
                    {{ plan.name }}
                    @if (plan.isDefault) {
                      <span class="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs">{{
                        t.defaultBadge
                      }}</span>
                    }
                    @if (!plan.isPublic) {
                      <span class="rounded-full bg-field px-2.5 py-0.5 text-xs">{{
                        t.privateBadge
                      }}</span>
                    }
                    @if (plan.archived) {
                      <span class="rounded-full bg-field px-2.5 py-0.5 text-xs">{{
                        t.archivedBadge
                      }}</span>
                    }
                  </h2>
                  <p class="text-sm text-muted">{{ plan.description }}</p>
                  <p class="font-amount text-sm">
                    {{ t.users(plan.userCount) }} · {{ limitsLine(plan) }}
                  </p>
                </div>
                <button plButton="secondary" size="sm" type="button" (click)="editing.set(plan.id)">
                  {{ t.edit }}
                </button>
              </div>
            }
          </li>
        }
      </ul>
    } @else {
      <pl-skeleton [heights]="[96, 96]" />
    }
  `,
})
export class AdminPlansPage implements OnInit {
  private readonly api = inject(AdminApi);
  protected readonly t = T;
  protected readonly loadError = ADMIN_TEXTS.loadError;
  protected readonly plans = signal<AdminPlan[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly editing = signal<string | null>(null);

  ngOnInit(): void {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.editing.set(null);
    this.failed.set(false);
    try {
      this.plans.set(await this.api.plans());
    } catch {
      this.failed.set(true);
    }
  }

  protected limitsLine(plan: AdminPlan): string {
    const parts = LIMIT_KEYS.map(
      (key) => `${T.limitNames[key].split(' ')[0]} ${plan.limits[key] ?? '∞'}`,
    );
    return [...parts, plan.limits.investments ? T.investments : ''].filter(Boolean).join(' · ');
  }
}
