import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideChevronDown, LucideLock, LucidePlus } from '@lucide/angular';
import type { Category } from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import {
  PlBottomSheet,
  PlButton,
  PlErrorState,
  PlListItem,
  PlSegmented,
  PlSegmentOption,
  PlSkeleton,
} from '@platin/web-ui';
import { API } from '../../core/api';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { CATEGORIES_TEXTS } from './categories.texts';
import { CategoryFormData, CategoryFormSheet } from './category-form-sheet';

interface Row {
  category: Category;
  child: boolean;
}

/** CAT-01: the user's categories by kind, with icon, color and how many records use them. */
@Component({
  selector: 'pl-categories-page',
  imports: [
    PlSegmented,
    PlButton,
    PlListItem,
    PlSkeleton,
    PlErrorState,
    LucidePlus,
    LucideLock,
    LucideChevronDown,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
      <button
        plButton
        size="sm"
        type="button"
        [attr.aria-label]="texts.newLabel"
        (click)="open(null)"
      >
        <svg lucidePlus [size]="18"></svg>{{ texts.new }}
      </button>
    </header>
    <p class="text-[15px] text-muted">{{ texts.intro }}</p>
    <pl-segmented tone="surface" [label]="texts.kindLabel" [options]="kinds" [(value)]="kind" />

    @if (resource.error() && !resource.hasValue()) {
      <pl-error-state (retry)="resource.reload()" />
    } @else if (!resource.hasValue()) {
      <pl-skeleton [heights]="[68, 68, 68, 68, 68]" />
    } @else {
      <ul class="rounded-tile bg-surface px-4">
        @for (row of rows(); track row.category.id) {
          <li class="border-b border-line-soft last:border-b-0" [class.pl-8]="row.child">
            @if (row.category.systemKey) {
              <pl-list-item
                [heading]="row.category.name"
                [subtitle]="texts.system"
                [icon]="row.category.icon"
                [tone]="row.category.color"
              >
                <svg lucideLock [size]="16" class="text-muted" aria-hidden="true"></svg>
              </pl-list-item>
            } @else {
              <button
                type="button"
                class="w-full rounded-xl text-left"
                [attr.aria-label]="texts.editLabel(row.category.name)"
                (click)="open(row.category)"
              >
                <pl-list-item
                  [heading]="row.category.name"
                  [subtitle]="texts.uses(row.category.usageCount ?? 0)"
                  [icon]="row.category.icon"
                  [tone]="row.category.color"
                />
              </button>
            }
          </li>
        }
      </ul>
      @if (hasSystem()) {
        <p class="px-2 text-sm text-muted">{{ texts.systemHint }}</p>
      }

      <section class="flex flex-col gap-2">
        <button
          type="button"
          class="flex min-h-11 items-center gap-2 self-start rounded-full px-2 text-[15px] font-semibold text-muted hover:bg-field"
          [attr.aria-expanded]="showArchived()"
          (click)="showArchived.set(!showArchived())"
        >
          {{ texts.archived(archived().length) }}
          <svg
            lucideChevronDown
            [size]="18"
            class="transition-transform"
            [class.rotate-180]="showArchived()"
            aria-hidden="true"
          ></svg>
        </button>
        @if (showArchived()) {
          @if (archived().length === 0) {
            <p class="px-2 text-sm text-muted">{{ texts.emptyArchived }}</p>
          } @else {
            <ul class="rounded-tile bg-surface px-4 opacity-80">
              @for (category of archived(); track category.id) {
                <li class="border-b border-line-soft last:border-b-0">
                  <button
                    type="button"
                    class="w-full rounded-xl text-left"
                    [attr.aria-label]="texts.editLabel(category.name)"
                    (click)="open(category)"
                  >
                    <pl-list-item
                      [heading]="category.name"
                      [subtitle]="texts.uses(category.usageCount ?? 0)"
                      [icon]="category.icon"
                      tone="muted"
                    />
                  </button>
                </li>
              }
            </ul>
          }
        }
      </section>
    }
  `,
})
export class CategoriesPage {
  protected readonly texts = CATEGORIES_TEXTS;
  private readonly sheet = inject(PlBottomSheet);
  private readonly bus = inject(RefreshBus);

  protected readonly kinds: PlSegmentOption<CategoryKind>[] = [
    { value: 'EXPENSE', label: CATEGORIES_TEXTS.kinds.EXPENSE },
    { value: 'INCOME', label: CATEGORIES_TEXTS.kinds.INCOME },
  ];
  protected readonly kind = signal<CategoryKind>('EXPENSE');
  protected readonly showArchived = signal(false);

  /** Archived ones too, with how many records use each. */
  protected readonly resource = httpResource<Category[]>(
    () => `${API}/categories?archived=true&usage=true`,
  );
  private readonly all = computed(() => this.resource.value() ?? []);

  /** Active categories of the kind: parents in alphabetical order, each followed by its children. */
  protected readonly rows = computed<Row[]>(() => {
    const active = this.all().filter((c) => c.kind === this.kind() && !c.archived);
    const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'es');
    const ids = new Set(active.map((c) => c.id));
    const tops = active.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(byName);
    return tops.flatMap((top) => [
      { category: top, child: false },
      ...active
        .filter((c) => c.parentId === top.id)
        .sort(byName)
        .map((category) => ({ category, child: true })),
    ]);
  });

  protected readonly hasSystem = computed(() => this.rows().some((row) => row.category.systemKey));

  protected readonly archived = computed(() =>
    this.all()
      .filter((c) => c.kind === this.kind() && c.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  );

  constructor() {
    reloadOn(this.bus, ['categories'], () => this.resource.reload());
  }

  protected open(category: Category | null): void {
    this.sheet.open(CategoryFormSheet, {
      data: {
        category: category ?? undefined,
        kind: this.kind(),
        all: this.all(),
      } satisfies CategoryFormData,
      ariaLabel: category ? this.texts.form.editTitle : this.texts.form.newTitle,
    });
  }
}
