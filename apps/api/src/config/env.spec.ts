import { loadEnv } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://localhost/platin',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  REFRESH_TOKEN_PEPPER: 'y'.repeat(32),
};

const GOOGLE = {
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
  PUBLIC_APP_URL: 'https://platin.vercel.app/',
  OAUTH_COOKIE_SECRET: 'z'.repeat(32),
};

describe('loadEnv: sign in with Google', () => {
  it('is optional: empty values mean disabled', () => {
    const env = loadEnv({ ...BASE, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.PUBLIC_APP_URL).toBeUndefined();
  });

  it('trims the trailing slash of PUBLIC_APP_URL', () => {
    expect(loadEnv({ ...BASE, ...GOOGLE }).PUBLIC_APP_URL).toBe('https://platin.vercel.app');
  });

  it('requires the client id and secret together', () => {
    expect(() => loadEnv({ ...BASE, ...GOOGLE, GOOGLE_CLIENT_SECRET: '' })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
  });

  it('requires PUBLIC_APP_URL and OAUTH_COOKIE_SECRET when Google is enabled', () => {
    expect(() => loadEnv({ ...BASE, ...GOOGLE, PUBLIC_APP_URL: '' })).toThrow(/PUBLIC_APP_URL/);
    expect(() => loadEnv({ ...BASE, ...GOOGLE, OAUTH_COOKIE_SECRET: 'corto' })).toThrow(
      /OAUTH_COOKIE_SECRET/,
    );
  });
});
