import { describe, expect, it } from 'vitest';
import { loginRequestSchema, registerRequestSchema } from './auth';
import { amountSchema, localDateSchema, periodSchema, rateSchema } from './common';

describe('auth schemas', () => {
  it('normalizes the email', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Jose@Mail.COM ',
      password: '1234567890',
    });
    expect(parsed.email).toBe('jose@mail.com');
  });

  it('requires 10 characters for the password', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'a@b.co', password: '123456789' }).success,
    ).toBe(false);
  });

  it('rejects malformed emails', () => {
    expect(loginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
  });
});

describe('common schemas', () => {
  it('accepts amounts as decimal strings only', () => {
    expect(amountSchema.safeParse('18500.00').success).toBe(true);
    expect(amountSchema.safeParse('18500').success).toBe(true);
    expect(amountSchema.safeParse('0').success).toBe(false);
    expect(amountSchema.safeParse('-1').success).toBe(false);
    expect(amountSchema.safeParse('1.234').success).toBe(false);
    expect(amountSchema.safeParse(18500).success).toBe(false);
  });

  it('validates dates, periods and rates', () => {
    expect(localDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(localDateSchema.safeParse('2026-10-23').success).toBe(true);
    expect(periodSchema.safeParse('2026-10').success).toBe(true);
    expect(periodSchema.safeParse('2026-10-01').success).toBe(false);
    expect(rateSchema.safeParse('1250.123456').success).toBe(true);
    expect(rateSchema.safeParse('0').success).toBe(false);
  });
});
