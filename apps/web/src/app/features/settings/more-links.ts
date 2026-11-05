import type { PlanFeature } from '@platin/domain';
import { SETTINGS_TEXTS } from './settings.texts';

export interface MoreLink {
  path: string;
  label: string;
  /** Lucide icon name (registered in core/icons). */
  icon: string;
  /** PLN-07: outside the plan, the link shows the plan mark and opens the plan sheet. */
  gate?: PlanFeature;
}

const t = SETTINGS_TEXTS.more;

/**
 * The sections that don't fit in the phone's bottom bar: the "Más" screen on a phone, and the
 * desktop sidebar lists them all, so nothing hides behind "Más" there.
 */
export const MORE_LINKS: readonly MoreLink[] = [
  { path: '/app/cuentas', label: t.accounts, icon: 'wallet' },
  { path: '/app/compromisos', label: t.commitments, icon: 'calendar' },
  { path: '/app/ahorros', label: t.savings, icon: 'piggy-bank' },
  { path: '/app/inversiones', label: t.investments, icon: 'trending-up', gate: 'investments' },
  { path: '/app/fijos', label: t.fixed, icon: 'repeat' },
  { path: '/app/categorias', label: t.categories, icon: 'tag' },
  { path: '/app/pendientes', label: t.pending, icon: 'sparkles' },
  { path: '/app/perfil', label: t.profile, icon: 'user' },
];

/** The admin panel shows up only for administrators; the API checks it again. */
export function moreLinksFor(role: string | undefined): readonly MoreLink[] {
  return role === 'ADMIN'
    ? [...MORE_LINKS, { path: '/admin', label: t.admin, icon: 'shield-check' }]
    : MORE_LINKS;
}
