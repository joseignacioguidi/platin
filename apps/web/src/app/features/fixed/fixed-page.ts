import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucidePlus } from '@lucide/angular';
import type { FixedItem } from '@platin/contracts';
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
import { FixedFormSheet } from './fixed-form-sheet';
import { FixedStore } from './fixed.store';
import { FIXED_TEXTS } from './fixed.texts';

/** /app/fijos: fixed expenses and incomes with their next occurrence and amount. */
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
    <header class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col">
        <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
        <pl-usage resource="fixed" />
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button plButton size="sm" type="button" plPlanGate="fixed" (click)="open(null)">
          <svg lucidePlus [size]="18"></svg>{{ texts.new }}
        </button>
      </div>
    </header>
    <p class="text-[15px] text-muted">{{ texts.intro }}</p>

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
      @for (group of groups(); track group.title) {
        @if (group.items.length > 0) {
          <section class="flex flex-col gap-2">
            <h2 class="px-2 text-[15px] font-semibold text-muted">{{ group.title }}</h2>
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
          </section>
        }
      }
    }
  `,
})
export class FixedPage {
  protected readonly texts = FIXED_TEXTS;
  protected readonly store = inject(FixedStore);
  private readonly sheet = inject(PlBottomSheet);

  protected readonly groups = computed(() => [
    { title: this.texts.expenses, items: this.store.items().filter((i) => i.kind === 'EXPENSE') },
    { title: this.texts.incomes, items: this.store.items().filter((i) => i.kind === 'INCOME') },
  ]);

  protected subtitle(item: FixedItem): string {
    if (item.paused) return this.texts.paused;
    if (!item.next) return this.texts.finished;
    const badge = dateBadge(parseLocalDate(item.next.date));
    const when = this.texts.next(`${Number(badge.day)} ${badge.month.toLowerCase()}`);
    // TAR-09: a subscription shows the card it's charged to.
    const where = item.card ? ` · ${item.card.name}` : '';
    return `${this.texts.every(item.intervalMonths)}${where} · ${when}`;
  }

  protected open(item: FixedItem | null): void {
    this.sheet.open(FixedFormSheet, {
      data: item,
      ariaLabel: item ? this.texts.edit : this.texts.new,
    });
  }

  protected changeAmount(item: FixedItem): void {
    this.sheet.open(ChangeAmountSheet, { data: item, ariaLabel: this.texts.amount.title });
  }
}
