import { z } from 'zod';

/** Stable error codes the UI can rely on. */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode] | (string & {});

export const problemFieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** RFC 9457 Problem Details, plus a stable `code`. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
  errors: z.array(problemFieldErrorSchema).optional(),
  // Extension members of PLAN_LIMIT_REACHED and FEATURE_NOT_IN_PLAN.
  resource: z.string().optional(),
  limit: z.number().int().nullable().optional(),
  used: z.number().int().optional(),
  plan: z.string().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type ProblemFieldError = z.infer<typeof problemFieldErrorSchema>;
