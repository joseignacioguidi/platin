import type { ColorToken } from '@platin/contracts';
import type { Prisma } from '../generated/prisma/client';

export interface SuggestedCategory {
  name: string;
  kind: 'INCOME' | 'EXPENSE';
  icon: string;
  color: ColorToken;
}

/** Default categories every new user starts with; the admin can replace them (ADM-05). */
export const SUGGESTED_CATEGORIES: readonly SuggestedCategory[] = [
  { name: 'Supermercado', kind: 'EXPENSE', icon: 'shopping-cart', color: 'expense' },
  { name: 'Delivery', kind: 'EXPENSE', icon: 'bike', color: 'expense' },
  { name: 'Salidas', kind: 'EXPENSE', icon: 'utensils', color: 'expense' },
  { name: 'Transporte', kind: 'EXPENSE', icon: 'bus', color: 'transfer' },
  { name: 'Nafta', kind: 'EXPENSE', icon: 'fuel', color: 'expense' },
  { name: 'Servicios', kind: 'EXPENSE', icon: 'plug-zap', color: 'pending' },
  { name: 'Alquiler', kind: 'EXPENSE', icon: 'house', color: 'card' },
  { name: 'Suscripciones', kind: 'EXPENSE', icon: 'repeat', color: 'pending' },
  { name: 'Salud', kind: 'EXPENSE', icon: 'heart-pulse', color: 'expense' },
  { name: 'Farmacia', kind: 'EXPENSE', icon: 'pill', color: 'expense' },
  { name: 'Ropa', kind: 'EXPENSE', icon: 'shirt', color: 'card' },
  { name: 'Educación', kind: 'EXPENSE', icon: 'graduation-cap', color: 'transfer' },
  { name: 'Regalos', kind: 'EXPENSE', icon: 'gift', color: 'card' },
  { name: 'Impuestos y comisiones', kind: 'EXPENSE', icon: 'landmark', color: 'muted' },
  { name: 'Otros gastos', kind: 'EXPENSE', icon: 'ellipsis', color: 'muted' },
  { name: 'Sueldo', kind: 'INCOME', icon: 'briefcase', color: 'brand' },
  { name: 'Freelance', kind: 'INCOME', icon: 'laptop', color: 'brand' },
  { name: 'Ventas', kind: 'INCOME', icon: 'tag', color: 'brand' },
  { name: 'Intereses', kind: 'INCOME', icon: 'percent', color: 'savings' },
  { name: 'Otros ingresos', kind: 'INCOME', icon: 'plus', color: 'brand' },
];

/** Categories the app uses itself (CAT-05): balance and statement adjustments, yields. */
export const SYSTEM_CATEGORIES: readonly (SuggestedCategory & {
  systemKey: 'ADJUSTMENT' | 'YIELD';
})[] = [
  { name: 'Ajustes', kind: 'EXPENSE', icon: 'scale', color: 'muted', systemKey: 'ADJUSTMENT' },
  {
    name: 'Rendimientos',
    kind: 'INCOME',
    icon: 'trending-up',
    color: 'savings',
    systemKey: 'YIELD',
  },
];

/** Creates the given suggested categories (the admin can change them) plus the system ones. */
export async function seedSuggestedCategories(
  tx: Prisma.TransactionClient,
  userId: string,
  suggested: readonly SuggestedCategory[] = SUGGESTED_CATEGORIES,
): Promise<void> {
  await tx.category.createMany({
    data: [...suggested, ...SYSTEM_CATEGORIES].map((category) => ({
      ...category,
      userId,
    })),
  });
}
