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

export const categorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: categoryKindSchema,
  icon: iconNameSchema,
  color: colorTokenSchema,
  parentId: uuidSchema.nullable(),
  archived: z.boolean(),
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
    archived: z.boolean(),
  })
  .partial();

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryRequest = z.input<typeof createCategoryRequestSchema>;
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
