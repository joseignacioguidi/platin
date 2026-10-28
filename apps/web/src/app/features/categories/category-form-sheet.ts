import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { type Category, type ColorToken, createCategoryRequestSchema } from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import {
  PlButton,
  PlCategorySelect,
  PlColorPicker,
  PlIconPicker,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
  PlSheet,
  PlTone,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { CATEGORY_ICONS } from '../../core/icons';
import { CategoriesStore } from './categories.store';
import { CATEGORIES_TEXTS } from './categories.texts';

export interface CategoryFormData {
  /** Editing; without it, a new category of `kind`. */
  category?: Category;
  kind: CategoryKind;
  /** Every category of the user, archived included, with its usage count. */
  all: readonly Category[];
}

type Mode = 'form' | 'merge';

/** CAT-02/03/04: create or edit a category, archive it or merge it into another. */
@Component({
  selector: 'pl-category-form-sheet',
  imports: [
    PlSheet,
    PlButton,
    PlSegmented,
    PlSelect,
    PlCategorySelect,
    PlIconPicker,
    PlColorPicker,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="mode() === 'merge' ? f.mergeTitle : category ? f.editTitle : f.newTitle">
      @if (mode() === 'form') {
        <pl-form-field [label]="f.name" controlId="category-name">
          <input
            id="category-name"
            type="text"
            maxlength="40"
            [class]="input"
            [placeholder]="f.namePlaceholder"
            [value]="name()"
            (input)="name.set(value($event))"
          />
        </pl-form-field>
        @if (!category) {
          <div class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">{{ f.kind }}</span>
            <pl-segmented
              [label]="f.kind"
              [options]="kinds"
              [value]="kind()"
              (valueChange)="setKind($event)"
            />
          </div>
        }
        <pl-form-field [label]="f.parent" controlId="category-parent" [hint]="f.parentHint">
          <pl-select
            inputId="category-parent"
            [label]="f.parent"
            [options]="parentOptions()"
            [emptyLabel]="f.noParent"
            [disabled]="hasChildren"
            [value]="parentId()"
            (valueChange)="parentId.set($event)"
          />
        </pl-form-field>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ f.color }}</span>
          <pl-color-picker [label]="f.color" [(value)]="color" />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ f.icon }}</span>
          <pl-icon-picker
            [label]="f.icon"
            [icons]="icons"
            [tone]="color() ?? 'muted'"
            [(value)]="icon"
          />
        </div>

        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
          {{ category ? f.save : f.create }}
        </button>
        @if (category) {
          <div class="grid grid-cols-2 gap-2">
            <button
              plButton="secondary"
              type="button"
              [disabled]="saving()"
              (click)="toggleArchive()"
            >
              {{ category.archived ? f.unarchive : f.archive }}
            </button>
            @if (!category.archived) {
              <button plButton="secondary" type="button" (click)="mode.set('merge')">
                {{ f.merge }}
              </button>
            }
          </div>
          @if (!category.archived) {
            <p class="text-xs text-muted">{{ f.archiveHint }}</p>
          }
        }
      } @else if (category) {
        <pl-form-field [label]="f.mergeTarget" controlId="merge-target">
          <pl-category-select
            inputId="merge-target"
            [label]="f.mergeTarget"
            [kind]="category.kind"
            [categories]="mergeTargets()"
            [value]="targetId()"
            (valueChange)="targetId.set($event)"
          />
        </pl-form-field>
        @if (target(); as target) {
          <p class="rounded-2xl bg-pending-soft px-4 py-3 text-[15px] text-pending-ink">
            {{ f.mergeConfirm(category.usageCount ?? 0, category.name, target.name) }}
          </p>
        }
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <div class="grid grid-cols-2 gap-2">
          <button plButton="secondary" type="button" (click)="mode.set('form')">
            {{ f.cancel }}
          </button>
          <button plButton="danger" type="button" [disabled]="saving()" (click)="merge()">
            {{ f.mergeYes }}
          </button>
        </div>
      }
    </pl-sheet>
  `,
})
export class CategoryFormSheet {
  protected readonly f = CATEGORIES_TEXTS.form;
  protected readonly input = INPUT_CLASS;
  protected readonly icons = CATEGORY_ICONS;
  private readonly data = inject<CategoryFormData>(DIALOG_DATA);
  protected readonly category = this.data.category;
  private readonly store = inject(CategoriesStore);
  private readonly ref = inject(DialogRef);

  protected readonly kinds: PlSegmentOption<CategoryKind>[] = [
    { value: 'EXPENSE', label: CATEGORIES_TEXTS.kindSingular.EXPENSE },
    { value: 'INCOME', label: CATEGORIES_TEXTS.kindSingular.INCOME },
  ];
  protected readonly mode = signal<Mode>('form');
  protected readonly name = signal(this.category?.name ?? '');
  protected readonly kind = signal<CategoryKind>(this.category?.kind ?? this.data.kind);
  protected readonly parentId = signal<string | null>(this.category?.parentId ?? null);
  protected readonly color = signal<PlTone | null>(this.category?.color ?? 'expense');
  protected readonly icon = signal<string | null>(this.category?.icon ?? 'tag');
  protected readonly targetId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** One level of nesting: a category with subcategories can't become one. */
  protected readonly hasChildren = this.data.all.some((c) => c.parentId === this.category?.id);

  /** Top-level, active, non-system categories of the same kind. */
  protected readonly parentOptions = computed<PlSelectOption[]>(() =>
    this.data.all
      .filter(
        (c) =>
          c.kind === this.kind() &&
          c.id !== this.category?.id &&
          !c.parentId &&
          !c.systemKey &&
          !c.archived,
      )
      .map((c) => ({ value: c.id, label: c.name, icon: c.icon, tone: c.color })),
  );

  protected readonly mergeTargets = computed(() =>
    this.data.all.filter((c) => c.id !== this.category?.id && !c.archived),
  );
  protected readonly target = computed(() => this.data.all.find((c) => c.id === this.targetId()));

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setKind(kind: CategoryKind): void {
    this.kind.set(kind);
    this.parentId.set(null);
  }

  protected async save(): Promise<void> {
    const name = createCategoryRequestSchema.shape.name.safeParse(this.name());
    if (!name.success) return this.error.set(this.f.errors.name);
    const color = (this.color() ?? 'muted') as ColorToken;
    const icon = this.icon() ?? 'tag';
    const category = this.category;
    await this.run(() =>
      category
        ? this.store.update(category.id, {
            name: name.data,
            color,
            icon,
            ...(this.hasChildren ? {} : { parentId: this.parentId() }),
          })
        : this.store.create({
            name: name.data,
            kind: this.kind(),
            color,
            icon,
            parentId: this.parentId(),
          }),
    );
  }

  protected async toggleArchive(): Promise<void> {
    const category = this.category;
    if (category)
      await this.run(() => this.store.update(category.id, { archived: !category.archived }));
  }

  protected async merge(): Promise<void> {
    const category = this.category;
    const targetId = this.targetId();
    if (!targetId) return this.error.set(this.f.errors.target);
    if (category) await this.run(() => this.store.merge(category.id, targetId));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await action();
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
