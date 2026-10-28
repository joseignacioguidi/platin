import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideChevronRight, LucideDynamicIcon } from '@lucide/angular';
import { SETTINGS_TEXTS } from './settings.texts';

interface MoreLink {
  path: string;
  label: string;
  icon: string;
}

/** "Más": secondary sections that don't fit in the bottom bar. Later phases add entries. */
@Component({
  selector: 'pl-more-page',
  imports: [RouterLink, LucideChevronRight, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-4 text-xl font-bold">{{ texts.title }}</h1>
    <nav class="rounded-tile bg-surface px-2 py-1">
      <ul>
        @for (link of links; track link.path) {
          <li class="border-b border-line-soft last:border-b-0">
            <a
              [routerLink]="link.path"
              class="flex min-h-14 items-center gap-3 rounded-xl px-3 font-medium hover:bg-field"
            >
              <svg [lucideIcon]="link.icon" [size]="20" class="text-muted"></svg>
              <span class="flex-1">{{ link.label }}</span>
              <svg lucideChevronRight [size]="18" class="text-muted"></svg>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class MorePage {
  protected readonly texts = SETTINGS_TEXTS.more;
  protected readonly links: MoreLink[] = [
    { path: '/app/ahorros', label: SETTINGS_TEXTS.more.savings, icon: 'piggy-bank' },
    { path: '/app/pendientes', label: SETTINGS_TEXTS.more.pending, icon: 'sparkles' },
    { path: '/app/compromisos', label: SETTINGS_TEXTS.more.commitments, icon: 'calendar' },
    { path: '/app/fijos', label: SETTINGS_TEXTS.more.fixed, icon: 'repeat' },
    { path: '/app/cuentas', label: SETTINGS_TEXTS.more.accounts, icon: 'wallet' },
    { path: '/app/categorias', label: SETTINGS_TEXTS.more.categories, icon: 'tag' },
    { path: '/app/perfil', label: SETTINGS_TEXTS.more.profile, icon: 'user' },
  ];
}
