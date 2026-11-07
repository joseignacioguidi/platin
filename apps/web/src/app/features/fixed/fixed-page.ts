import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucidePlus } from '@lucide/angular';
import type { FixedItem } from '@platin/contracts';
import type { FixedKind } from '@platin/domain';
import { parseLocalDate } from '@platin/domain';
import {
  dateBadge,
  PlBottomSheet,
  PlButton,
  PlEmptyState,
  PlListItem,
  PlMoney,
  PlErrorState,
  PlSkeleton,
} from '@platin/web-ui';
import { PlanGate, PlUsage } from '../plans/plan-gate';
import { ChangeAmountSheet } from './change-amount-sheet';
import { FixedFormPreset, FixedFormSheet } from './fixed-form-sheet';
import { FixedStore } from './fixed.store';
import { FIXED_TEXTS } from './fixed.texts';

/** Compromisos › Fijos (FIJ-01 to 04, COM-05): fixed expenses and incomes with their next occurrence and amount. */
@Component({
  selector: 'pl-fixed-page',
  imports: [
    PlSkeleton,
    PlErrorState,
    PlButton,
    PlEmptyState,
    PlListItem,
    PlMoney,
    LucidePlus,
    PlanGate,
    PlUsage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <!-- Compromisos › Fijos (COM-05): the section has the title; the action stays here. -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="min-w-0 flex-1 text-[15px] text-muted">{{ texts.intro }}</p>
      <div class="flex shrink-0 items-center gap-3">
        <pl-usage resource="fixed" />
        <button plButton size="sm" type="button" plPlanGate="fixed" (click)="open(null)">
          <svg lucidePlus [size]="18"></svg>{{ texts.new }}
        </button>
      </div>
    </div>

    @if (store.resource.error() && !store.resource.hasValue()) {
      <pl-error-state (retry)="store.resource.reload()" />
    } @else if (!store.resource.hasValue()) {
      <pl-skeleton [heights]="[72, 72, 72]" />
    } @else if (store.items().length === 0) {
      <pl-empty-state icon="repeat" [heading]="texts.emptyTitle" [description]="texts.emptyBody">
        <button plButton type="button" plPlanGate="fixed" (click)="open(null)">
          {{ texts.new }}
        </button>
      </pl-empty-state>
    } @else {
      <!-- From lg, expenses and incomes side by side. -->
      <div class="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        @for (group of groups(); track group.kind) {
          <section class="flex flex-col gap-2" [attr.aria-labelledby]="'fixed-' + group.kind">
            <h2 [id]="'fixed-' + group.kind" class="px-2 text-[15px] font-semibold text-muted">
              {{ group.title }}
            </h2>
            @if (group.items.length > 0) {
              <ul class="rounded-tile bg-surface px-4">
                @for (item of group.items; track item.id) {
                  <li class="flex items-center gap-2 border-b border-line-soft last:border-b-0">
                    <button
                      type="button"
                      class="min-w-0 flex-1 rounded-xl text-left"
                      (click)="open(item)"
                    >
                      <pl-list-item
                        [heading]="item.name"
                        [subtitle]="subtitle(item)"
                        [icon]="item.category.icon"
                        [tone]="
                          item.paused || !item.next
                            ? 'muted'
                            : item.kind === 'INCOME'
                              ? 'brand'
                              : 'pending'
                        "
                      >
                        <pl-money
                          class="text-[17px]"
                          [amount]="item.currentAmount"
                          [currency]="item.currency"
                          [tone]="item.kind === 'INCOME' ? 'income' : 'none'"
                        />
                      </pl-list-item>
                    </button>
                    <button
                      type="button"
                      class="min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-brand-strong hover:bg-field"
                      (click)="changeAmount(item)"
                    >
                      {{ texts.amount.open }}
                    </button>
                  </li>
                }
              </ul>
            } @else if (group.kind === 'INCOME') {
              <!-- The margin of Compromisos needs the salary (COM-05). -->
              <div class="flex flex-col items-start gap-1 rounded-tile bg-surface p-5">
                <p class="font-semibold">{{ texts.noIncomesTitle }}</p>
                <p class="text-sm text-muted">{{ texts.noIncomesBody }}</p>
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center font-semibold text-brand-strong"
                  plPlanGate="fixed"
                  (click)="openNew('INCOME')"
                >
                  {{ texts.newIncome }}
                </button>
              </div>
            } @else {
              <p class="rounded-tile bg-surface p-5 text-sm text-muted">{{ texts.noExpenses }}</p>
            }
          </section>
        }
      </div>
    }
  `,
})
export class FixedPage {
  protected readonly texts = FIXED_TEXTS;
  protected readonly store = inject(FixedStore);
  private readonly sheet = inject(PlBottomSheet);

  protected readonly groups = computed(() =>
    (['EXPENSE', 'INCOME'] as const).map((kind) => ({
      kind,
      title: kind === 'EXPENSE' ? this.texts.expenses : this.texts.incomes,
      items: this.store.items().filter((i) => i.kind === kind),
    })),
  );

  protected subtitle(item: FixedItem): string {
    if (item.paused) return this.texts.paused;
    if (!item.next) return this.texts.finished;
    const badge = dateBadge(parseLocalDate(item.next.date));
    const when = this.texts.next(`${Number(badge.day)} ${badge.month.toLowerCase()}`);
    // TAR-09: a subscription shows the card it's charged to.
    const where = item.card?.name ?? item.pocket?.accountName;
    const every = `${this.texts.every(item.intervalMonths)} ${this.texts.dayOf(item.dayOfMonth)}`;
    return [every, where, when].filter(Boolean).join(' · ');
  }

  protected open(item: FixedItem | null): void {
    this.sheet.open(FixedFormSheet, {
      data: item,
      ariaLabel: item ? this.texts.edit : this.texts.new,
    });
  }

  protected openNew(kind: FixedKind): void {
    this.sheet.open(FixedFormSheet, {
      data: { kind } satisfies FixedFormPreset,
      ariaLabel: kind === 'INCOME' ? this.texts.newIncomeLabel : this.texts.new,
    });
  }

  protected changeAmount(item: FixedItem): void {
    this.sheet.open(ChangeAmountSheet, { data: item, ariaLabel: this.texts.amount.title });
  }
}
