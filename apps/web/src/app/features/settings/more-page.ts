import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideDynamicIcon, LucideEyeOff, LucideMoon } from '@lucide/angular';
import { HideAmounts } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { LAYOUT_TEXTS } from '../../layout/layout.texts';
import { ADMIN_LINK, initials, MORE_SECTIONS, PROFILE_PATH } from '../../layout/nav-links';
import { PENDING_BADGE_CLASS, PendingCount } from '../../layout/pending-count';
import { PlanGate } from '../plans/plan-gate';
import { PlanStore } from '../plans/plan.store';
import { SETTINGS_TEXTS } from './settings.texts';

/**
 * "Más" on a phone (NAV-02): the profile row, the three sections that don't fit in the bottom
 * bar, the hide-amounts and dark-mode switches and, for administrators, the admin panel.
 */
@Component({
  selector: 'pl-more-page',
  imports: [RouterLink, LucideChevronRight, LucideDynamicIcon, LucideEyeOff, LucideMoon, PlanGate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <h1 class="mx-1 text-3xl font-bold">{{ texts.title }}</h1>

    <a
      [routerLink]="profilePath"
      class="flex min-h-[76px] items-center gap-3.5 rounded-card bg-surface px-4 py-3 hover:bg-field"
    >
      <span
        class="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[17px] font-extrabold text-brand-strong"
        aria-hidden="true"
        >{{ initials() }}</span
      >
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-[17px] font-bold">{{ displayName() }}</span>
        <span class="truncate text-[13px] text-muted">{{ nav.profileHint(planName()) }}</span>
      </span>
      <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
    </a>

    <nav [attr.aria-label]="nav.moreSections" class="rounded-card bg-surface">
      <ul>
        @for (link of sections; track link.path) {
          <li class="border-t border-line-soft first:border-t-0">
            <a
              [routerLink]="link.path"
              [plPlanGate]="link.gate ?? []"
              class="flex min-h-[60px] items-center gap-3.5 rounded-card px-4 hover:bg-field"
            >
              <svg [lucideIcon]="link.icon" [size]="20" aria-hidden="true"></svg>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="font-semibold">{{ link.label }}</span>
                <span class="truncate text-[13px] text-muted">{{ link.hint }}</span>
              </span>
              @if (link.pendingCount && pending.label(); as count) {
                <span [class]="badgeClass" [attr.aria-label]="nav.pending(count)">{{ count }}</span>
              }
              <span data-plan-badge class="contents"></span>
              <svg lucideChevronRight [size]="18" class="text-muted" aria-hidden="true"></svg>
            </a>
          </li>
        }
      </ul>
    </nav>

    <div class="flex flex-col rounded-card bg-surface">
      <label class="flex min-h-14 cursor-pointer items-center gap-3.5 px-4">
        <svg lucideEyeOff [size]="20" aria-hidden="true"></svg>
        <span class="flex-1 font-semibold">{{ layout.hideAmounts }}</span>
        <input
          type="checkbox"
          role="switch"
          class="size-5 accent-brand"
          [checked]="hideAmounts.hidden()"
          (change)="hideAmounts.toggle()"
        />
      </label>
      <label
        class="flex min-h-14 cursor-pointer items-center gap-3.5 border-t border-line-soft px-4"
      >
        <svg lucideMoon [size]="20" aria-hidden="true"></svg>
        <span class="flex-1 font-semibold">{{ layout.darkMode }}</span>
        <input
          type="checkbox"
          role="switch"
          class="size-5 accent-brand"
          [checked]="theme.theme() === 'dark'"
          (change)="theme.toggle()"
        />
      </label>
    </div>

    @if (isAdmin()) {
      <a
        [routerLink]="adminLink.path"
        class="flex min-h-12 items-center gap-3 rounded-xl px-4 font-medium text-muted hover:bg-field"
      >
        <svg [lucideIcon]="adminLink.icon" [size]="20" aria-hidden="true"></svg>
        {{ adminLink.label }}
      </a>
    }
  `,
})
export class MorePage {
  private readonly auth = inject(AuthService);
  private readonly plan = inject(PlanStore);
  protected readonly hideAmounts = inject(HideAmounts);
  protected readonly theme = inject(ThemeService);
  protected readonly pending = inject(PendingCount);

  protected readonly texts = SETTINGS_TEXTS.more;
  protected readonly layout = LAYOUT_TEXTS;
  protected readonly nav = LAYOUT_TEXTS.nav;
  protected readonly sections = MORE_SECTIONS;
  protected readonly adminLink = ADMIN_LINK;
  protected readonly profilePath = PROFILE_PATH;
  protected readonly badgeClass = PENDING_BADGE_CLASS;

  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    return user?.name || user?.email || '';
  });
  protected readonly initials = computed(() =>
    initials(this.auth.user()?.name, this.auth.user()?.email),
  );
  protected readonly planName = computed(() => this.plan.plan()?.plan.name ?? null);
}
