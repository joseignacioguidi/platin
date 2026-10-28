import { z } from 'zod';
import { currencySchema, rateTypeSchema, uuidSchema } from './common';

export const PASSWORD_MIN_LENGTH = 10;

export const roleSchema = z.enum(['USER', 'ADMIN']);
export const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
export type Role = z.infer<typeof roleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Ingresá un email válido').max(254));

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `La contraseña tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    )
    .max(200),
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Ingresá tu contraseña').max(200),
});

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string().nullable(),
  baseCurrency: currencySchema,
  valuationRate: rateTypeSchema,
  role: roleSchema,
});

export const updateUserRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80).nullable(),
    baseCurrency: currencySchema,
    valuationRate: rateTypeSchema,
  })
  .partial();

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type User = z.infer<typeof userSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
