import { CategoryKind } from '@platin/domain';
import { z } from 'zod';
import { colorTokenSchema } from './accounts';
import { uuidSchema } from './common';

export const categoryKindSchema = z.enum([CategoryKind.INCOME, CategoryKind.EXPENSE]);

/** Lucide icon name in kebab-case ("shopping-cart"). */
export const iconNameSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Ícono inválido')
  .max(40);

/** Categories the app creates and uses itself (CAT-05): not editable nor archivable. */
export const categorySystemKeySchema = z.enum(['ADJUSTMENT', 'YIELD']);

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: categoryKindSchema,
  icon: iconNameSchema,
  color: colorTokenSchema,
  parentId: uuidSchema.nullable(),
  systemKey: categorySystemKeySchema.nullable(),
  archived: z.boolean(),
  /** Movements, card charges, statement adjustments and fixed items using it (with ?usage=true). */
  usageCount: z.number().int().nonnegative().optional(),
});

export const createCategoryRequestSchema = z.object({
  name: z.string().trim().min(1, 'Ingresá un nombre').max(40),
  kind: categoryKindSchema,
  icon: iconNameSchema,
  color: colorTokenSchema,
  parentId: uuidSchema.nullable().default(null),
});

export const updateCategoryRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingresá un nombre').max(40),
    icon: iconNameSchema,
    color: colorTokenSchema,
    parentId: uuidSchema.nullable(),
    archived: z.boolean(),
  })
  .partial();

/** CAT-04: moves everything to the target (same kind) and archives the source. */
export const mergeCategoryRequestSchema = z.object({ targetId: uuidSchema });

export const mergeCategoryResponseSchema = z.object({
  target: categorySchema,
  moved: z.number().int().nonnegative(),
});

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryRequest = z.input<typeof createCategoryRequestSchema>;
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
export type CategorySystemKey = z.infer<typeof categorySystemKeySchema>;
export type MergeCategoryRequest = z.infer<typeof mergeCategoryRequestSchema>;
export type MergeCategoryResponse = z.infer<typeof mergeCategoryResponseSchema>;
