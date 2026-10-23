import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

export const envSchema = z.object({
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
  RATES_BASE_URL: z.string().default('https://dolarapi.com'),
  CLOCK_TODAY: optionalString.pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
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
