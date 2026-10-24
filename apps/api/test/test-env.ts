import { config } from 'dotenv';
import { resolve } from 'node:path';

/** Points the API at the test database. Real env vars (CI) win over the repo .env. */
export function loadTestEnv(): string {
  config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.ORIGIN_SECRET = '';
  process.env.CLOCK_TODAY = '';
  process.env.THROTTLE_AUTH_LIMIT = '1000';
  process.env.THROTTLE_LIMIT = '10000';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-with-at-least-32-chars';
  process.env.REFRESH_TOKEN_PEPPER ??= 'test-refresh-pepper-with-at-least-32-chars';
  return url;
}
