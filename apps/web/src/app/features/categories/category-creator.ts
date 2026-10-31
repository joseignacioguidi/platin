import { inject, Injectable, Injector, Provider } from '@angular/core';
import type { Category } from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import { PL_CATEGORY_CREATOR, PlBottomSheet, PlCategoryCreator } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { CategoriesStore } from './categories.store';
import { CATEGORIES_TEXTS } from './categories.texts';

/**
 * CAT-06: every pl-category-select with `allowCreate` opens the category form in a sheet on top
 * of the current one. The form is loaded on demand, so it never weighs on the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class CategoryCreator implements PlCategoryCreator {
  private readonly injector = inject(Injector);

  async create(kind: CategoryKind, name: string): Promise<Category | null> {
    const { CategoryFormSheet } = await import('./category-form-sheet');
    const store = this.injector.get(CategoriesStore);
    const ref = this.injector.get(PlBottomSheet).open(CategoryFormSheet, {
      data: { kind, name, fixedKind: true, all: store.categories() },
      ariaLabel: CATEGORIES_TEXTS.form.newTitle,
    });
    const result = await firstValueFrom(ref.closed);
    return isCategory(result) ? result : null;
  }
}

function isCategory(value: unknown): value is Category {
  return typeof value === 'object' && value !== null && 'id' in value && 'kind' in value;
}

export function provideCategoryCreator(): Provider {
  return { provide: PL_CATEGORY_CREATOR, useExisting: CategoryCreator };
}
