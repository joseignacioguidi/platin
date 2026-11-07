import { ChangeDetectionStrategy, Component, computed, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideCreditCard,
  LucideDynamicIcon,
  LucideEllipsis,
  LucideEye,
  LucideEyeOff,
  LucideHouse,
  LucideList,
  LucideMoon,
  LucidePlus,
  LucideSun,
} from '@lucide/angular';
import { HideAmounts } from '@platin/web-ui';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/theme/theme.service';
import { PlanGate } from '../features/plans/plan-gate';
import { QuickEntryLauncher } from '../features/quick-entry/quick-entry-launcher';
import { AnnouncementBanner } from './announcement-banner';
import { LAYOUT_TEXTS } from './layout.texts';
import { ADMIN_LINK, initials, PROFILE_PATH, SIDEBAR_SECTIONS } from './nav-links';
import { PENDING_BADGE_CLASS, PendingCount } from './pending-count';

/**
 * App shell: bottom bar on mobile (Inicio, Movimientos, +, Tarjetas, Más) and a sidebar on
 * desktop with six sections, the profile and the toggles (NAV-01). The + button (or Ctrl+K)
 * opens the quick entry sheet.
 */
@Component({
  selector: 'pl-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    AnnouncementBanner,
    RouterLinkActive,
    LucideHouse,
    LucideList,
    LucideCreditCard,
    LucideEllipsis,
    LucideDynamicIcon,
    PlanGate,
    LucidePlus,
    LucideEye,
    LucideEyeOff,
    LucideMoon,
    LucideSun,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-canvas text-ink' },
  template: `
    <!-- Desktop sidebar -->
    <aside
      class="fixed inset-y-0 left-0 hidden w-68 flex-col gap-4 overflow-y-auto border-r border-line-soft bg-surface px-4 py-5 lg:flex"
    >
      <a routerLink="/app" class="flex items-center gap-3 px-2">
        <img src="favicon.svg" alt="" width="36" height="36" class="rounded-[10px]" />
        <span class="text-xl font-bold">platin</span>
      </a>
      <button
        type="button"
        class="flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand font-semibold text-ink hover:bg-brand-hover hover:text-on-ink"
        (click)="quickEntry.open()"
      >
        <svg lucidePlus [size]="20"></svg>
        {{ texts.nav.add }}
      </button>
      <!-- NAV-01: six sections; the profile and the toggles live at the foot. -->
      <nav [attr.aria-label]="texts.nav.label" class="flex flex-col gap-0.5">
        @for (item of sections; track item.path) {
          <a
            [routerLink]="item.path"
            [plPlanGate]="item.gate ?? []"
            routerLinkActive="bg-brand-soft font-bold text-brand-strong"
            [routerLinkActiveOptions]="{ exact: item.path === '/app' }"
            #rla="routerLinkActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
            class="flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 font-medium hover:bg-field"
          >
            <svg [lucideIcon]="item.icon" [size]="20" aria-hidden="true"></svg>
            <span class="flex-1">{{ item.label }}</span>
            @if (item.pendingCount && pending.label(); as count) {
              <span [class]="badgeClass" [attr.aria-label]="texts.nav.pending(count)">{{
                count
              }}</span>
            }
          </a>
        }
      </nav>
      <div class="mt-auto flex flex-col gap-1.5 border-t border-line-soft pt-3">
        @if (isAdmin()) {
          <a
            [routerLink]="adminLink.path"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-field"
          >
            <svg [lucideIcon]="adminLink.icon" [size]="20" aria-hidden="true"></svg>
            {{ adminLink.label }}
          </a>
        }
        <div class="flex items-center gap-1">
          <a
            [routerLink]="profilePath"
            routerLinkActive="bg-brand-soft"
            #profileRla="routerLinkActive"
            [attr.aria-current]="profileRla.isActive ? 'page' : null"
            class="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 hover:bg-field"
          >
            <span
              class="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-extrabold text-brand-strong"
              aria-hidden="true"
              >{{ initials() }}</span
            >
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm font-bold">{{ displayName() }}</span>
              <span class="text-xs text-muted">{{ texts.nav.profile }}</span>
            </span>
          </a>
          <button
            type="button"
            class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field"
            [attr.aria-label]="hideAmounts.hidden() ? texts.showAmounts : texts.hideAmounts"
            [attr.title]="hideAmounts.hidden() ? texts.showAmounts : texts.hideAmounts"
            [attr.aria-pressed]="hideAmounts.hidden()"
            (click)="hideAmounts.toggle()"
          >
            @if (hideAmounts.hidden()) {
              <svg lucideEye [size]="20" aria-hidden="true"></svg>
            } @else {
              <svg lucideEyeOff [size]="20" aria-hidden="true"></svg>
            }
          </button>
          <button
            type="button"
            class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field"
            [attr.aria-label]="theme.theme() === 'dark' ? texts.toLight : texts.toDark"
            [attr.title]="texts.darkMode"
            (click)="theme.toggle()"
          >
            @if (theme.theme() === 'dark') {
              <svg lucideSun [size]="20" aria-hidden="true"></svg>
            } @else {
              <svg lucideMoon [size]="20" aria-hidden="true"></svg>
            }
          </button>
        </div>
      </div>
    </aside>

    <main
      class="mx-auto w-full max-w-3xl px-5 pb-32 pt-4 lg:pl-72 lg:pr-8 lg:pb-12 lg:pt-8 lg:max-w-none"
    >
      <!--
        The home (DAS-07), Compromisos, Ahorros e inversiones and the profile use the desktop's
        width in columns; the rest keeps one column.
      -->
      <div
        class="mx-auto w-full max-w-3xl xl:has-[>pl-dashboard-page]:max-w-6xl lg:has-[>pl-commitments-section]:max-w-6xl lg:has-[>pl-savings-section]:max-w-6xl lg:has-[>pl-profile-page]:max-w-6xl"
      >
        <pl-announcement-banner />
        <router-outlet />
      </div>
    </main>

    <!-- Mobile bottom bar -->
    <nav
      [attr.aria-label]="texts.nav.label"
      class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line-soft bg-surface lg:hidden"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      @for (item of navItems; track item.path; let i = $index) {
        @if (i === 2) {
          <div class="relative flex justify-center">
            <button
              type="button"
              class="absolute -top-6 flex size-[60px] items-center justify-center rounded-full bg-brand text-ink ring-8 ring-surface"
              [attr.aria-label]="texts.nav.add"
              (click)="quickEntry.open()"
            >
              <svg lucidePlus [size]="28" [strokeWidth]="2.4"></svg>
            </button>
          </div>
        }
        <a
          [routerLink]="item.path"
          routerLinkActive="font-semibold"
          [routerLinkActiveOptions]="{ exact: item.exact }"
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          class="flex h-[68px] flex-col items-center justify-center gap-1 text-xs"
          [class.text-brand-strong]="rla.isActive"
          [class.text-muted]="!rla.isActive"
        >
          @switch (item.icon) {
            @case ('home') {
              <svg lucideHouse [size]="24"></svg>
            }
            @case ('list') {
              <svg lucideList [size]="24"></svg>
            }
            @case ('card') {
              <svg lucideCreditCard [size]="24"></svg>
            }
            @case ('more') {
              <svg lucideEllipsis [size]="24"></svg>
            }
          }
          {{ item.label }}
        </a>
      }
    </nav>
  `,
})
export class Shell {
  protected readonly texts = LAYOUT_TEXTS;
  protected readonly hideAmounts = inject(HideAmounts);
  protected readonly quickEntry = inject(QuickEntryLauncher);

  protected readonly theme = inject(ThemeService);
  protected readonly pending = inject(PendingCount);
  private readonly auth = inject(AuthService);

  protected readonly sections = SIDEBAR_SECTIONS;
  protected readonly adminLink = ADMIN_LINK;
  protected readonly profilePath = PROFILE_PATH;
  protected readonly badgeClass = PENDING_BADGE_CLASS;
  /** The admin panel shows up only for administrators; the API checks it again. */
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    return user?.name || user?.email || '';
  });
  protected readonly initials = computed(() =>
    initials(this.auth.user()?.name, this.auth.user()?.email),
  );

  protected readonly navItems = [
    { path: '/app', label: LAYOUT_TEXTS.nav.home, icon: 'home', exact: true },
    { path: '/app/movimientos', label: LAYOUT_TEXTS.nav.transactions, icon: 'list', exact: false },
    { path: '/app/tarjetas', label: LAYOUT_TEXTS.nav.cards, icon: 'card', exact: false },
    { path: '/app/mas', label: LAYOUT_TEXTS.nav.more, icon: 'more', exact: false },
  ] as const;

  /** Ctrl+K (or Cmd+K) opens the quick entry on desktop. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.quickEntry.open();
    }
  }
}
