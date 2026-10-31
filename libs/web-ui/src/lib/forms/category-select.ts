import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  InjectionToken,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import type { CategoryKind } from '@platin/domain';
import { PlTone } from '../list-item/list-item';
import { PlFormControl } from './form-control';
import { PlSelect, PlSelectOption } from './select';

/** What pl-category-select needs from a category (structurally the API's Category). */
export interface PlCategoryOption {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: PlTone;
  parentId: string | null;
  archived: boolean;
  /** System categories (Ajustes, Rendimientos) are never offered. */
  systemKey?: string | null;
}

/**
 * CAT-06: opens the app's category form on top of what is being loaded and resolves with the
 * created category (or `null` if the user closed it). The app provides it; without a provider,
 * `allowCreate` has no effect.
 */
export interface PlCategoryCreator {
  create(kind: CategoryKind, name: string): Promise<PlCategoryOption | null>;
}

export const PL_CATEGORY_CREATOR = new InjectionToken<PlCategoryCreator>('PL_CATEGORY_CREATOR');

/**
 * pl-select with the active categories of a kind, with icon and color; recent ones first and
 * subcategories showing their parent. With `allowCreate`, the list ends with "+ Nueva categoría".
 */
@Component({
  selector: 'pl-category-select',
  imports: [PlSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PlCategorySelect),
      multi: true,
    },
  ],
  host: { class: 'block min-w-0' },
  template: `
    <pl-select
      [options]="options()"
      [label]="label()"
      [inputId]="inputId()"
      [placeholder]="placeholder()"
      [emptyLabel]="emptyLabel()"
      [appearance]="appearance()"
      [invalid]="invalid()"
      [disabled]="isDisabled()"
      [createLabel]="canCreate() ? createLabel() : null"
      searchable="auto"
      [value]="value()"
      (valueChange)="commit($event)"
      (create)="create($event)"
    />
  `,
})
export class PlCategorySelect extends PlFormControl<string | null> {
  readonly value = model<string | null>(null);
  readonly categories = input.required<readonly PlCategoryOption[]>();
  readonly kind = input.required<CategoryKind>();
  /** Ids of recently used categories, most recent first. */
  readonly recentIds = input<readonly string[]>([]);
  readonly label = input('Categoría');
  readonly inputId = input<string>();
  readonly placeholder = input('Elegí una categoría');
  readonly emptyLabel = input<string | null>(null);
  readonly appearance = input<'field' | 'tile'>('field');
  readonly invalid = input(false);
  /** CAT-06: "+ Nueva categoría" at the end; the created one is chosen. */
  readonly allowCreate = input(false, { transform: booleanAttribute });
  readonly createLabel = input('+ Nueva categoría');

  private readonly select = viewChild.required(PlSelect);
  private readonly creator = inject(PL_CATEGORY_CREATOR, { optional: true });
  protected readonly canCreate = computed(() => this.allowCreate() && this.creator !== null);
  /** Created here and not yet in `categories` (the list reloads after the write). */
  private readonly created = signal<PlCategoryOption[]>([]);

  protected readonly options = computed<PlSelectOption[]>(() => {
    const given = this.categories();
    const all = [...given, ...this.created().filter((c) => !given.some((g) => g.id === c.id))];
    const byId = new Map(all.map((category) => [category.id, category]));
    const current = this.value();
    const usable = all.filter(
      (category) =>
        category.kind === this.kind() &&
        !category.systemKey &&
        (!category.archived || category.id === current),
    );
    const recent = this.recentIds();
    const rank = (id: string) => {
      const index = recent.indexOf(id);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...usable]
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'es'))
      .map((category) => {
        const parent = category.parentId ? byId.get(category.parentId) : undefined;
        return {
          value: category.id,
          label: category.name,
          hint: parent?.name ?? null,
          icon: category.icon,
          tone: category.color,
          keywords: parent?.name,
        };
      });
  });

  open(): void {
    this.select().open();
  }

  protected async create(name: string): Promise<void> {
    const category = await this.creator?.create(this.kind(), name);
    if (!category) return;
    this.created.update((list) => [...list, category]);
    this.commit(category.id);
  }
}
