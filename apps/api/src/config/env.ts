import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  ORIGIN_SECRET: optionalString,
  APP_ORIGIN: z.string().default('http://localhost:4200'),
  // Requests per minute and IP: strict on /auth/*, general elsewhere.
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(5),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  // Comma-separated emails that get the ADMIN role when they sign in (ADM-01).
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  RATES_BASE_URL: z.string().default('https://dolarapi.com'),
  CLOCK_TODAY: optionalString.pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
  // Public address of the web app: the OAuth redirect URIs and the redirects after sign-in
  // are built from it, never from the request's Host header.
  PUBLIC_APP_URL: optionalString.pipe(
    z
      .url()
      .transform((url) => url.replace(/\/+$/, ''))
      .optional(),
  ),
  // Signs the short-lived oauth_tx cookie. Generate with: openssl rand -base64 48
  OAUTH_COOKIE_SECRET: optionalString.pipe(z.string().min(32).optional()),
  // Google sign-in (AUTH-06) is enabled only when both are set.
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_SECRET'],
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET go together',
    });
  }
  if (env.GOOGLE_CLIENT_ID) {
    for (const key of ['PUBLIC_APP_URL', 'OAUTH_COOKIE_SECRET'] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Required to sign in with Google' });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }
  return result.data;
}
