import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideDynamicIcon } from '@lucide/angular';
import { AuthService } from '../../core/auth/auth.service';
import { PlanGate } from '../plans/plan-gate';
import { moreLinksFor } from './more-links';
import { SETTINGS_TEXTS } from './settings.texts';

/** "Más": secondary sections that don't fit in the bottom bar. Later phases add entries. */
@Component({
  selector: 'pl-more-page',
  imports: [RouterLink, LucideChevronRight, LucideDynamicIcon, PlanGate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-4 text-xl font-bold">{{ texts.title }}</h1>
    <nav class="rounded-tile bg-surface px-2 py-1">
      <ul>
        @for (link of visibleLinks(); track link.path) {
          <li class="border-b border-line-soft last:border-b-0">
            <a
              [routerLink]="link.path"
              [plPlanGate]="link.gate ?? []"
              class="flex min-h-14 items-center gap-3 rounded-xl px-3 font-medium hover:bg-field"
            >
              <svg [lucideIcon]="link.icon" [size]="20" class="text-muted"></svg>
              <span class="flex-1">{{ link.label }}</span>
              <span data-plan-badge class="contents"></span>
              <svg lucideChevronRight [size]="18" class="text-muted"></svg>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class MorePage {
  private readonly auth = inject(AuthService);
  protected readonly texts = SETTINGS_TEXTS.more;
  protected readonly visibleLinks = computed(() => moreLinksFor(this.auth.user()?.role));
}
