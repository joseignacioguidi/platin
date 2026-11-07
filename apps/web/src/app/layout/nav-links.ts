import type { PlanFeature } from '@platin/domain';
import { LAYOUT_TEXTS } from './layout.texts';

export interface NavLink {
  path: string;
  label: string;
  /** Lucide icon name (registered in core/icons). */
  icon: string;
  /** One line of what the section has, under its name in "Más" (NAV-02). */
  hint?: string;
  /** Shows how many movements wait for confirmation (NAV-01). */
  pendingCount?: boolean;
  /** PLN-07: outside the plan, the link shows the plan mark and opens the plan sheet. */
  gate?: PlanFeature;
}

const t = LAYOUT_TEXTS.nav;

/**
 * NAV-01/02 (iteration 10): the sections that don't fit in the phone's bottom bar. "Más" lists
 * them; the desktop sidebar puts them among Inicio, Movimientos and Tarjetas.
 */
export const NAV_LINKS = {
  accounts: { path: '/app/cuentas', label: t.accounts, icon: 'wallet', hint: t.accountsHint },
  commitments: {
    path: '/app/compromisos',
    label: t.commitments,
    icon: 'calendar',
    hint: t.commitmentsHint,
    pendingCount: true,
  },
  savings: { path: '/app/ahorros', label: t.savings, icon: 'piggy-bank', hint: t.savingsHint },
} as const satisfies Record<string, NavLink>;

/** What "Más" lists on a phone, in order. */
export const MORE_SECTIONS: readonly NavLink[] = [
  NAV_LINKS.accounts,
  NAV_LINKS.commitments,
  NAV_LINKS.savings,
];

/** The six sections of the desktop sidebar, in order. */
export const SIDEBAR_SECTIONS: readonly NavLink[] = [
  { path: '/app', label: t.home, icon: 'house' },
  { path: '/app/movimientos', label: t.transactions, icon: 'list' },
  NAV_LINKS.accounts,
  { path: '/app/tarjetas', label: t.cards, icon: 'credit-card' },
  NAV_LINKS.commitments,
  NAV_LINKS.savings,
];

export const ADMIN_LINK: NavLink = { path: '/admin', label: t.admin, icon: 'shield-check' };
export const PROFILE_PATH = '/app/perfil';

/** "JI" for "Jose Ignacio", the email's first letter without a name. */
export function initials(name: string | null | undefined, email: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}
