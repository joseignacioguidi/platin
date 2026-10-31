import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicPlan } from '@platin/contracts';
import { LIMITED_RESOURCES, type LimitedResource } from '@platin/domain';
import { PlBottomSheet, PlButton, PlSegmented, PlSegmentOption, PlSheet } from '@platin/web-ui';
import { errorMessage, problemOf } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { type PlanBlock, PlanStore } from './plan.store';
import { LIMIT_KEYS, limitLabel, PLANS_TEXTS } from './plans.texts';

export interface PlanSheetData {
  /** Why it opened: a limit, a feature, or the user asking from the profile. */
  reason:
    | { kind: 'limit'; plan: string; resource: LimitedResource; limit: number }
    | { kind: 'feature'; plan: string }
    | { kind: 'request' };
}

/** PLN-04: explains the limit and lets the user ask the admin for another plan. */
@Component({
  selector: 'pl-plan-sheet',
  imports: [PlSheet, PlButton, PlSegmented, FormField, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="heading">
      @if (body) {
        <p class="text-[15px]">{{ body }}</p>
      } @else {
        <p class="text-[15px] text-muted">{{ t.requestBody }}</p>
      }

      @if (sent()) {
        <p class="rounded-2xl bg-brand-soft px-4 py-3 text-[15px]" role="status">{{ t.sent }}</p>
        <button plButton size="lg" type="button" (click)="ref.close()">{{ t.close }}</button>
      } @else if (pending(); as pending) {
        <p class="rounded-2xl bg-pending-soft px-4 py-3 text-[15px] text-pending-ink" role="status">
          {{ t.pending(pending.planName) }}
        </p>
        <button plButton size="lg" type="button" (click)="ref.close()">{{ t.close }}</button>
      } @else if (options().length > 0) {
        @if (options().length > 1) {
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ t.choose }}</span>
            <pl-segmented
              [label]="t.choose"
              [options]="options()"
              [value]="planId()"
              (valueChange)="planId.set($event)"
            />
          </div>
        }
        @if (selected(); as plan) {
          <ul class="rounded-2xl bg-field px-4 py-3 text-[15px]">
            @for (line of summary(plan); track line) {
              <li class="py-0.5">{{ line }}</li>
            }
          </ul>
        }
        <pl-form-field [label]="t.message" controlId="plan-message">
          <textarea
            id="plan-message"
            rows="2"
            maxlength="500"
            [class]="input + ' py-3'"
            [placeholder]="t.messagePlaceholder"
            [value]="message()"
            (input)="message.set(value($event))"
          ></textarea>
        </pl-form-field>
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="button" [disabled]="saving()" (click)="send()">
          {{ t.send(selected()?.name ?? '') }}
        </button>
      }
      <a
        routerLink="/planes"
        class="flex min-h-11 items-center justify-center text-sm font-semibold text-brand-strong"
        (click)="ref.close()"
        >{{ t.seePlans }}</a
      >
    </pl-sheet>
  `,
})
export class PlanSheet implements OnInit {
  protected readonly data = inject<PlanSheetData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly store = inject(PlanStore);
  protected readonly t = PLANS_TEXTS;
  protected readonly input = INPUT_CLASS;

  protected readonly heading =
    this.data.reason.kind === 'limit'
      ? PLANS_TEXTS.limitTitle
      : this.data.reason.kind === 'feature'
        ? PLANS_TEXTS.featureTitle
        : PLANS_TEXTS.requestTitle;
  protected readonly body =
    this.data.reason.kind === 'limit'
      ? PLANS_TEXTS.limitBody(
          this.data.reason.plan,
          this.data.reason.limit,
          this.data.reason.resource,
        )
      : this.data.reason.kind === 'feature'
        ? PLANS_TEXTS.featureBody(this.data.reason.plan)
        : null;

  private readonly plans = signal<PublicPlan[]>([]);
  protected readonly planId = signal<string | null>(null);
  protected readonly message = signal('');
  protected readonly saving = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pending = computed(() => this.store.plan()?.pendingRequest ?? null);

  /** Every public plan except the current one. */
  protected readonly options = computed<PlSegmentOption<string | null>[]>(() => {
    const current = this.store.plan()?.plan.id;
    return this.plans()
      .filter((plan) => plan.id !== current)
      .map((plan) => ({ value: plan.id, label: plan.name }));
  });
  protected readonly selected = computed(() =>
    this.plans().find((plan) => plan.id === this.planId()),
  );

  async ngOnInit(): Promise<void> {
    try {
      const plans = await this.store.publicPlans();
      this.plans.set(plans);
      // Suggest the first plan above the current one (the list comes in order).
      const current = this.store.plan()?.plan.id;
      const others = plans.filter((plan) => plan.id !== current);
      this.planId.set(others.find((plan) => !plan.isDefault)?.id ?? others[0]?.id ?? null);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected summary(plan: PublicPlan): string[] {
    return [
      ...PLANS_TEXTS.resources.map((resource) =>
        limitLabel(resource, plan.limits[LIMIT_KEYS[resource]]),
      ),
      plan.limits.investments
        ? PLANS_TEXTS.investmentsIncluded
        : PLANS_TEXTS.investmentsNotIncluded,
    ];
  }

  protected async send(): Promise<void> {
    const planId = this.planId();
    if (!planId) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.request(planId, this.message().trim() || undefined);
      this.sent.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}

/** Opens the sheet for a PLAN_LIMIT_REACHED or FEATURE_NOT_IN_PLAN answer (see the interceptor). */
export function openPlanSheetFor(injector: Injector, error: HttpErrorResponse): void {
  const problem = problemOf(error);
  const plan = problem?.plan ?? '';
  let reason: PlanSheetData['reason'] | null = null;
  if (problem?.code === 'PLAN_LIMIT_REACHED' && isResource(problem.resource)) {
    reason = { kind: 'limit', plan, resource: problem.resource, limit: problem.limit ?? 0 };
  } else if (problem?.code === 'FEATURE_NOT_IN_PLAN') {
    reason = { kind: 'feature', plan };
  }
  if (!reason) return;
  injector.get(PlBottomSheet).open<PlanSheet, PlanSheetData>(PlanSheet, {
    data: { reason },
    ariaLabel: PLANS_TEXTS.requestTitle,
  });
}

/** PLN-07: opens the sheet before trying, for something the plan already says is blocked. */
export function openPlanSheet(injector: Injector, block: PlanBlock): void {
  const reason: PlanSheetData['reason'] =
    block.kind === 'limit'
      ? { kind: 'limit', plan: block.plan, resource: block.resource, limit: block.limit }
      : { kind: 'feature', plan: block.plan };
  injector.get(PlBottomSheet).open<PlanSheet, PlanSheetData>(PlanSheet, {
    data: { reason },
    ariaLabel: PLANS_TEXTS.requestTitle,
  });
}

function isResource(value: unknown): value is LimitedResource {
  return LIMITED_RESOURCES.includes(value as LimitedResource);
}
