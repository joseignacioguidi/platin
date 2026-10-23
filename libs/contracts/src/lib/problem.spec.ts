import { describe, expect, it } from 'vitest';
import { problemDetailsSchema } from './problem';

describe('problemDetailsSchema', () => {
  it('accepts a problem with field errors', () => {
    const parsed = problemDetailsSchema.parse({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'amount', message: 'Required' }],
    });
    expect(parsed.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a problem without code', () => {
    expect(problemDetailsSchema.safeParse({ type: 'x', title: 'y', status: 500 }).success).toBe(
      false,
    );
  });
});
