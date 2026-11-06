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
  // A server without Vercel in front (VPS) has no origin secret: say so explicitly.
  ALLOW_DIRECT_ACCESS: z
    .enum(['true', 'false', ''])
    .optional()
    .transform((value) => value === 'true'),
  // How many proxies in front of the API append to X-Forwarded-For (Vercel + Render = 2). The
  // client IP is the entry that many hops from the right; anything further left is whatever the
  // client sent, and trusting it lets anyone dodge the rate limit (SEC-F01). 0 = no proxy.
  // Required in production: with 0 behind a proxy, every user would share one rate limit.
  TRUST_PROXY_HOPS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(0).max(10).optional(),
  ),
  // Header with the real client IP that the edge proxy always overwrites, so a client can't forge
  // it (Vercel: x-vercel-proxied-for; x-vercel-forwarded-for sometimes keeps a forged value).
  // Rate limiting uses it when present (SEC-F01). Set it only behind such a proxy, with
  // ORIGIN_SECRET keeping everyone else out.
  CLIENT_IP_HEADER: optionalString.pipe(
    z
      .string()
      .regex(/^[a-z0-9-]+$/i)
      .transform((value) => value.toLowerCase())
      .optional(),
  ),
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
  // Telegram bot (BOT-01 to 06): off without the token. Token and username from @BotFather.
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_BOT_USERNAME: optionalString.pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9_]{5,32}$/)
      .optional(),
  ),
  // The webhook's secret_token: A-Z, a-z, 0-9, _ and -; 32 characters or more.
  TELEGRAM_WEBHOOK_SECRET: optionalString.pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,256}$/)
      .optional(),
  ),
  // Pepper of the link codes' hash. Generate with: openssl rand -base64 48
  TELEGRAM_CODE_PEPPER: optionalString.pipe(z.string().min(32).optional()),
});

/** Values that must never sign anything in production (.env.example placeholders and the like). */
function isPlaceholderSecret(value: string): boolean {
  return /^change-me/i.test(value) || new Set(value).size <= 1;
}

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production') {
    for (const key of [
      'JWT_ACCESS_SECRET',
      'REFRESH_TOKEN_PEPPER',
      'OAUTH_COOKIE_SECRET',
    ] as const) {
      const value = env[key];
      if (value && isPlaceholderSecret(value)) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Placeholder secret in production' });
      }
    }
    if (env.JWT_ACCESS_SECRET === env.REFRESH_TOKEN_PEPPER) {
      ctx.addIssue({
        code: 'custom',
        path: ['REFRESH_TOKEN_PEPPER'],
        message: 'Must differ from JWT_ACCESS_SECRET',
      });
    }
    if (env.TRUST_PROXY_HOPS === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message: 'Required in production (2 behind Vercel and Render)',
      });
    }
    if (!env.ORIGIN_SECRET && !env.ALLOW_DIRECT_ACCESS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ORIGIN_SECRET'],
        message: 'Required in production (or set ALLOW_DIRECT_ACCESS=true without Vercel in front)',
      });
    }
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['GOOGLE_CLIENT_SECRET'],
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET go together',
    });
  }
  if (env.TELEGRAM_BOT_TOKEN) {
    for (const key of [
      'TELEGRAM_BOT_USERNAME',
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_CODE_PEPPER',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Required with TELEGRAM_BOT_TOKEN' });
      }
    }
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
