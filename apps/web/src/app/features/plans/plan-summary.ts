import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { localDateAt } from '@platin/domain';
import { formatDate, PlBottomSheet } from '@platin/web-ui';
import { PlanSheet, PlanSheetData } from './plan-sheet';
import { PlanStore } from './plan.store';
import { LIMIT_KEYS, PLANS_TEXTS, resourceName } from './plans.texts';

interface UsagePart {
  /** "4" or "3 de 5". */
  amount: string;
  name: string;
  /** Got to its limit: shown in `pending-ink`. */
  reached: boolean;
  /** ", ", " y " or the final ".". */
  after: string;
}

/**
 * PLN-03 in the profile, in one line (AUTH-10): the plan's name, "Cambiar de plan" and a sentence
 * with the usage ("Usás 4 cuentas, 13 reservas…"; with limits, "3 de 5 cuentas").
 */
@Component({
  selector: 'pl-plan-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (store.plan(); as mine) {
      <section
        class="flex flex-col gap-1.5 rounded-card bg-surface px-4 py-3 lg:px-6 lg:py-4"
        aria-labelledby="plan-title"
      >
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 id="plan-title" class="font-extrabold">{{ t.yourPlan }}</h2>
          <span
            class="rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-bold text-brand-strong"
            >{{ mine.plan.name }}</span
          >
          <span class="flex-1"></span>
          @if (!mine.pendingRequest) {
            <button
              type="button"
              class="flex min-h-11 items-center text-sm font-semibold text-brand-strong"
              (click)="ask()"
            >
              {{ t.changePlan }}
            </button>
          }
        </div>
        <p class="text-[13px] text-muted">
          {{ kind() }}
          {{ t.youUse }}
          <!-- The separator goes inside each part: whitespace between the spans is dropped. -->
          @for (part of usage(); track part.name) {
            <span [class]="part.reached ? 'font-semibold text-pending-ink' : ''"
              ><span class="font-amount" [class.text-ink]="!part.reached">{{ part.amount }}</span>
              {{ part.name }}{{ part.after }}</span
            >
          }
        </p>
        @if (mine.endsAt) {
          <p class="text-[13px] text-muted">{{ t.until(lastDay(mine.endsAt)) }}</p>
        }
        @if (mine.pendingRequest; as pending) {
          <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm text-pending-ink" role="status">
            {{ t.pending(pending.planName) }}
          </p>
        }
      </section>
    }
  `,
})
export class PlanSummary {
  protected readonly store = inject(PlanStore);
  private readonly sheet = inject(PlBottomSheet);
  protected readonly t = PLANS_TEXTS;

  /** "Sin límites, con inversiones." */
  protected readonly kind = computed(() => {
    const limits = this.store.plan()?.plan.limits;
    if (!limits) return '';
    const unlimited = this.t.resources.every((resource) => limits[LIMIT_KEYS[resource]] === null);
    return this.t.planKind(unlimited, limits.investments);
  });

  protected readonly usage = computed<UsagePart[]>(() => {
    const mine = this.store.plan();
    if (!mine) return [];
    const count = this.t.resources.length;
    return this.t.resources.map((resource, index) => {
      const after = index === count - 1 ? '.' : index === count - 2 ? ` ${this.t.and} ` : ', ';
      const used = mine.usage[resource];
      const limit = mine.plan.limits[LIMIT_KEYS[resource]];
      return limit === null
        ? { amount: String(used), name: resourceName(resource, used), reached: false, after }
        : {
            amount: this.t.usedOf(used, limit),
            name: resourceName(resource, limit),
            reached: used >= limit,
            after,
          };
    });
  });

  /** endsAt is the first instant it no longer applies: the last day is the one before. */
  protected lastDay(endsAt: string): string {
    return formatDate(localDateAt(new Date(new Date(endsAt).getTime() - 1)));
  }

  protected ask(): void {
    this.sheet.open<PlanSheet, PlanSheetData>(PlanSheet, {
      data: { reason: { kind: 'request' } },
      ariaLabel: PLANS_TEXTS.requestTitle,
    });
  }
}
