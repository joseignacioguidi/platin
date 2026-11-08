import type { Category } from '@platin/contracts';
import type { AccountKind, FixedKind } from '@platin/domain';

/** The four screens, in order, with their slug in /app/bienvenida/:paso. */
export const ONBOARDING_SCREENS = ['cuentas', 'tarjetas', 'fijos', 'libre'] as const;
export type OnboardingScreen = (typeof ONBOARDING_SCREENS)[number];

export const ONBOARDING_PATHS = {
  accounts: '/app/bienvenida/cuentas',
  cards: '/app/bienvenida/tarjetas',
  fixed: '/app/bienvenida/fijos',
  free: '/app/bienvenida/libre',
} as const;

export function screenPath(screen: OnboardingScreen): string {
  return `/app/bienvenida/${screen}`;
}

export function screenNumber(screen: OnboardingScreen): number {
  return ONBOARDING_SCREENS.indexOf(screen) + 1;
}

export interface AccountPreset {
  name: string;
  kind: AccountKind;
}

/** Step 1 chips (rule "Onboarding"): Efectivo comes chosen. */
export const ACCOUNT_PRESETS: readonly AccountPreset[] = [
  { name: 'Efectivo', kind: 'CASH' },
  { name: 'Mercado Pago', kind: 'WALLET' },
  { name: 'Santander', kind: 'BANK' },
  { name: 'Ualá', kind: 'WALLET' },
  { name: 'Galicia', kind: 'BANK' },
  { name: 'BBVA', kind: 'BANK' },
  { name: 'Brubank', kind: 'BANK' },
  { name: 'Naranja X', kind: 'WALLET' },
];

export interface FixedPreset {
  name: string;
  kind: FixedKind;
  /** Suggested category, by the name it has among the suggested ones. */
  category: string;
  /** Subscriptions are usually paid with the card. */
  onCard?: boolean;
}

/** Step 3 chips. */
export const FIXED_PRESETS: readonly FixedPreset[] = [
  { name: 'Sueldo', kind: 'INCOME', category: 'Sueldo' },
  { name: 'Alquiler', kind: 'EXPENSE', category: 'Alquiler' },
  { name: 'Expensas', kind: 'EXPENSE', category: 'Alquiler' },
  { name: 'Luz', kind: 'EXPENSE', category: 'Servicios' },
  { name: 'Gas', kind: 'EXPENSE', category: 'Servicios' },
  { name: 'Internet', kind: 'EXPENSE', category: 'Servicios' },
  { name: 'Celular', kind: 'EXPENSE', category: 'Servicios' },
  { name: 'Gimnasio', kind: 'EXPENSE', category: 'Salud' },
  { name: 'Spotify', kind: 'EXPENSE', category: 'Suscripciones', onCard: true },
  { name: 'Netflix', kind: 'EXPENSE', category: 'Suscripciones', onCard: true },
];

/** Category for "Otro" and for charges loaded without one. */
export const FALLBACK_CATEGORY: Record<FixedKind, string> = {
  INCOME: 'Otros ingresos',
  EXPENSE: 'Otros gastos',
};

/**
 * The category a fixed item or a charge of the onboarding goes to: the suggested one by name if
 * the user still has it, else "Otros", else the first active one of that kind.
 */
export function pickCategory(
  categories: readonly Category[],
  kind: FixedKind,
  name: string,
): Category | undefined {
  const usable = categories.filter((c) => c.kind === kind && !c.archived && !c.systemKey);
  const byName = (wanted: string) =>
    usable.find((c) => c.name.toLocaleLowerCase('es') === wanted.toLocaleLowerCase('es'));
  return byName(name) ?? byName(FALLBACK_CATEGORY[kind]) ?? usable[0];
}
