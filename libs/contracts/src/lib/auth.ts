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

// ---------- External providers (AUTH-06 to 08) ----------

export const authProviderSchema = z.enum(['GOOGLE', 'FACEBOOK', 'APPLE']);
export type AuthProvider = z.infer<typeof authProviderSchema>;

/** The provider in URLs: /auth/oauth/google/start. */
export const AUTH_PROVIDER_SLUGS = {
  GOOGLE: 'google',
  FACEBOOK: 'facebook',
  APPLE: 'apple',
} as const satisfies Record<AuthProvider, string>;
export type AuthProviderSlug = (typeof AUTH_PROVIDER_SLUGS)[AuthProvider];

export const authProvidersResponseSchema = z.object({
  providers: z.array(z.object({ provider: authProviderSchema, slug: z.string() })),
});

export const linkTicketResponseSchema = z.object({
  ticket: z.string(),
  expiresAt: z.string(),
});

export const authIdentitySchema = z.object({
  id: uuidSchema,
  provider: authProviderSchema,
  email: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const signInMethodsResponseSchema = z.object({
  hasPassword: z.boolean(),
  identities: z.array(authIdentitySchema),
});

export const setPasswordRequestSchema = z.object({
  password: registerRequestSchema.shape.password,
});

export type AuthProvidersResponse = z.infer<typeof authProvidersResponseSchema>;
export type LinkTicketResponse = z.infer<typeof linkTicketResponseSchema>;
export type AuthIdentity = z.infer<typeof authIdentitySchema>;
export type SignInMethodsResponse = z.infer<typeof signInMethodsResponseSchema>;
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type User = z.infer<typeof userSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
