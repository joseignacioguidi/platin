import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideArrowLeft, LucideDynamicIcon } from '@lucide/angular';
import { PlWink } from '@platin/web-ui';
import { ADMIN_TEXTS } from './admin.texts';

interface AdminNavItem {
  path: string;
  label: string;
  icon: string;
  exact: boolean;
}

/** Admin panel frame: sidebar on desktop, scrollable tabs on small screens. */
@Component({
  selector: 'pl-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon, LucideArrowLeft, PlWink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-canvas text-ink' },
  template: `
    <aside
      class="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 border-r border-line-soft bg-surface px-4 py-6 lg:flex"
    >
      <a routerLink="/admin" class="flex items-center gap-3 px-2">
        <pl-wink class="w-7" />
        <span class="flex flex-col leading-tight">
          <span class="text-xl font-bold tracking-[-0.04em]">{{ t.brand }}</span>
          <span class="text-xs text-muted">{{ t.panel }}</span>
        </span>
      </a>
      <nav [attr.aria-label]="t.nav.label" class="flex flex-col gap-1">
        @for (item of items; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="bg-brand-soft text-brand-strong"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            class="flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium hover:bg-field"
          >
            <svg [lucideIcon]="item.icon" [size]="20"></svg>
            {{ item.label }}
          </a>
        }
      </nav>
      <a
        routerLink="/app"
        class="mt-auto flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:bg-field"
      >
        <svg lucideArrowLeft [size]="20"></svg>
        {{ t.nav.backToApp }}
      </a>
    </aside>

    <header class="border-b border-line-soft bg-surface lg:hidden">
      <div class="flex items-center justify-between px-4 pt-3">
        <a routerLink="/admin" class="flex min-h-11 items-center gap-2 font-bold">
          <pl-wink class="w-5" />
          {{ t.panel }}
        </a>
        <a routerLink="/app" class="flex min-h-11 items-center gap-1 text-sm text-muted">
          <svg lucideArrowLeft [size]="16"></svg>
          {{ t.nav.backToApp }}
        </a>
      </div>
      <nav [attr.aria-label]="t.nav.label" class="flex gap-1 overflow-x-auto px-2 pb-2">
        @for (item of items; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="bg-brand-soft text-brand-strong"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            class="flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium"
            >{{ item.label }}</a
          >
        }
      </nav>
    </header>

    <main class="px-4 pb-16 pt-5 lg:pl-68 lg:pr-10 lg:pt-8">
      <div class="mx-auto w-full max-w-5xl">
        <router-outlet />
      </div>
    </main>
  `,
})
export class AdminLayout {
  protected readonly t = ADMIN_TEXTS;
  protected readonly items: AdminNavItem[] = [
    { path: '/admin', label: ADMIN_TEXTS.nav.overview, icon: 'layout-dashboard', exact: true },
    { path: '/admin/usuarios', label: ADMIN_TEXTS.nav.users, icon: 'users', exact: false },
    { path: '/admin/planes', label: ADMIN_TEXTS.nav.plans, icon: 'layers', exact: false },
    { path: '/admin/solicitudes', label: ADMIN_TEXTS.nav.requests, icon: 'inbox', exact: false },
    {
      path: '/admin/configuracion',
      label: ADMIN_TEXTS.nav.settings,
      icon: 'settings',
      exact: false,
    },
    { path: '/admin/auditoria', label: ADMIN_TEXTS.nav.audit, icon: 'scroll-text', exact: false },
  ];
}
