import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideListFilter, LucideTag } from '@lucide/angular';
import { RULES_VIEW_PARAM } from '../categories/rules-view';
import { CategoriesStore } from '../categories/categories.store';
import { PROFILE_GROUP } from './profile-group';
import { SETTINGS_TEXTS } from './settings.texts';

/** AUTH-10 "Personalización": Categorías (how many of each kind) and Reglas, each one a screen. */
@Component({
  selector: 'pl-personalization-card',
  imports: [RouterLink, LucideChevronRight, LucideTag, LucideListFilter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section [class]="group.section" aria-labelledby="personalization-title">
      <h2 id="personalization-title" [class]="group.title">{{ t.title }}</h2>
      <ul class="rounded-card bg-surface px-4 lg:-mt-2 lg:rounded-none lg:bg-transparent lg:px-0">
        <li class="border-line-soft lg:border-t">
          <a routerLink="/app/categorias" [class]="row">
            <svg lucideTag [size]="20" aria-hidden="true"></svg>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="font-semibold">{{ t.categories }}</span>
              @if (store.resource.hasValue()) {
                <span class="text-[13px] text-muted">{{ count() }}</span>
              }
            </span>
            <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
          </a>
        </li>
        <li class="border-t border-line-soft">
          <a routerLink="/app/categorias" [queryParams]="{ vista: rulesParam }" [class]="row">
            <svg lucideListFilter [size]="20" aria-hidden="true"></svg>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="font-semibold">{{ t.rules }}</span>
              <span class="text-[13px] text-muted">{{ t.rulesHint }}</span>
            </span>
            <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
          </a>
        </li>
      </ul>
    </section>
  `,
})
export class PersonalizationCard {
  protected readonly t = SETTINGS_TEXTS.personalization;
  protected readonly group = PROFILE_GROUP;
  protected readonly store = inject(CategoriesStore);
  protected readonly rulesParam = RULES_VIEW_PARAM;
  protected readonly row = 'flex min-h-[60px] items-center gap-3.5 rounded-xl hover:bg-field';

  protected readonly count = computed(() =>
    this.t.categoriesCount(this.store.ofKind('EXPENSE').length, this.store.ofKind('INCOME').length),
  );
}
