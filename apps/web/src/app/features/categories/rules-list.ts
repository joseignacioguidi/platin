import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { LucidePlus, LucideSearch } from '@lucide/angular';
import type { MerchantRule } from '@platin/contracts';
import { normalizeText } from '@platin/domain';
import { PlBottomSheet, PlButton, PlEmptyState, PlListItem, PlSkeleton } from '@platin/web-ui';
import { CategoriesStore } from './categories.store';
import { CATEGORIES_TEXTS } from './categories.texts';
import { MerchantRulesStore } from './merchant-rules.store';
import { RuleFormData, RuleFormSheet } from './rule-form-sheet';

/**
 * TXT-03: the merchant rules, all of them with a search (the "Reglas" tab) or those of one
 * category (its detail). Each row opens the rule to edit or delete it.
 */
@Component({
  selector: 'pl-rules-list',
  imports: [PlButton, PlListItem, PlEmptyState, PlSkeleton, LucidePlus, LucideSearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    @if (searchable()) {
      <p class="text-[15px] text-muted">{{ r.intro }}</p>
      <div class="flex items-center gap-2">
        <label class="relative flex-1">
          <span class="sr-only">{{ r.search }}</span>
          <svg
            lucideSearch
            [size]="18"
            class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          ></svg>
          <input
            type="search"
            class="min-h-11 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-[15px]"
            [placeholder]="r.search"
            [value]="query()"
            (input)="query.set(value($event))"
          />
        </label>
        <button plButton size="sm" type="button" [attr.aria-label]="r.newLabel" (click)="open()">
          <svg lucidePlus [size]="18" aria-hidden="true"></svg>{{ r.new }}
        </button>
      </div>
    }

    @if (!store.resource.hasValue()) {
      <pl-skeleton [heights]="[60, 60, 60]" />
    } @else if (rows().length === 0) {
      @if (searchable() && !query()) {
        <pl-empty-state icon="sparkles" [heading]="r.emptyTitle" [description]="r.emptyBody" />
      } @else if (searchable()) {
        <p class="px-2 text-sm text-muted">{{ r.noResults }}</p>
      } @else {
        <p class="text-sm text-muted">{{ r.noneForCategory }}</p>
      }
    } @else {
      <ul class="rounded-tile bg-surface px-4" [class.border]="!searchable()" [class.border-line]="!searchable()">
        @for (row of rows(); track row.rule.id) {
          <li class="border-b border-line-soft last:border-b-0">
            <button
              type="button"
              class="w-full rounded-xl text-left"
              [attr.aria-label]="r.editLabel(row.rule.pattern)"
              (click)="open(row.rule)"
            >
              <pl-list-item
                [heading]="row.rule.pattern"
                [subtitle]="row.subtitle"
                [icon]="row.icon"
                [tone]="row.tone"
              />
            </button>
          </li>
        }
      </ul>
    }
    @if (!searchable()) {
      <button plButton="secondary" type="button" (click)="open()">{{ r.addForCategory }}</button>
    }
  `,
})
export class RulesList {
  protected readonly r = CATEGORIES_TEXTS.rules;
  protected readonly store = inject(MerchantRulesStore);
  private readonly categories = inject(CategoriesStore);
  private readonly sheet = inject(PlBottomSheet);

  /** Only the rules of this category; without it, all of them with a search. */
  readonly categoryId = input<string | null>(null);
  readonly searchable = input(false, { transform: booleanAttribute });
  protected readonly query = signal('');

  protected readonly rows = computed(() => {
    const query = normalizeText(this.query());
    const only = this.categoryId();
    return this.store
      .rules()
      .filter((rule) => !only || rule.categoryId === only)
      .map((rule) => {
        const category = this.categories.byId(rule.categoryId);
        return {
          rule,
          name: category?.name ?? '',
          subtitle: this.r.goesTo(category?.name ?? '—'),
          icon: category?.icon ?? 'tag',
          tone: category?.color ?? ('muted' as const),
        };
      })
      .filter(
        (row) =>
          !query || row.rule.pattern.includes(query) || normalizeText(row.name).includes(query),
      );
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected open(rule?: MerchantRule): void {
    this.sheet.open(RuleFormSheet, {
      data: { rule, categoryId: this.categoryId() ?? undefined } satisfies RuleFormData,
      ariaLabel: rule ? this.r.editTitle : this.r.newTitle,
    });
  }
}
