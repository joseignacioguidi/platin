import request from 'supertest';
import { loadEnv } from '../../src/config/env';
import { as } from '../auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { Scenario, seedScenario, SECURITY_ENV } from './seed';

const APP_ORIGIN = 'https://platin.test';
const ORIGIN_SECRET = 'origin-secret-for-the-security-suite-0123456789';

describe('security: configuration, errors and infrastructure', () => {
  let ctx: TestContext;
  let s: Scenario;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp({ ...SECURITY_ENV, APP_ORIGIN });
    await resetDatabase(ctx.prisma);
    s = await seedScenario(ctx.app, ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
    vi.restoreAllMocks();
  });

  it('SEC-CONF-03 an unexpected error is a bare Problem Details: no stack, SQL, paths or table names', async () => {
    const leaky = new Error(
      'Invalid `prisma.account.findMany()` invocation in /app/src/accounts/accounts.service.ts:42:7 ' +
        'SELECT "public"."Account"."id" FROM "public"."Account" WHERE "userId" = $1',
    );
    vi.spyOn(ctx.prisma.account, 'findMany').mockRejectedValueOnce(leaky);
    const res = await as(ctx.app, s.a.user).get('/api/v1/accounts');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SEC-CONF-03 a 404 for an unknown route does not echo internals', async () => {
    const res = await as(ctx.app, s.a.user).get('/api/v1/no-existe/../../etc/passwd');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\.ts:\d+|at \w+ \(/);
  });

  it("SEC-CONF-05 the API sends helmet's security headers", async () => {
    const res = await request(server()).get('/api/v1/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'self'/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('SEC-CONF-06 CORS: no foreign origin is allowed on /api/v1/*, never "*", never with credentials', async () => {
    for (const url of ['/api/v1/accounts', '/api/v1/auth/refresh', '/api/v1/users/me']) {
      for (const origin of ['https://evil.example', 'null', APP_ORIGIN]) {
        const preflight = await request(server())
          .options(url)
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST')
          .set('Access-Control-Request-Headers', 'authorization,content-type');
        expect(
          preflight.headers['access-control-allow-origin'],
          `${url} ${origin}`,
        ).toBeUndefined();
        expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
        const res = await as(ctx.app, s.a.user).get(url).set('Origin', origin);
        expect(res.headers['access-control-allow-origin'], `${url} ${origin}`).toBeUndefined();
      }
    }
  });

  it('SEC-CONF-06 CORS on /health only allows the app origin, for GET, without credentials', async () => {
    const evil = await request(server())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    expect(evil.headers['access-control-allow-origin']).not.toBe('*');
    const app = await request(server()).get('/api/v1/health').set('Origin', APP_ORIGIN);
    expect(app.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(app.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('SEC-CONF-07 with ORIGIN_SECRET, only /health answers without the secret header', async () => {
    const guarded = await createTestApp({ ...SECURITY_ENV, ORIGIN_SECRET });
    try {
      const http = () => request(guarded.app.getHttpServer());
      const bearer = `Bearer ${s.a.user.accessToken}`;
      const cases: [string, string | undefined, number][] = [
        ['/api/v1/users/me', undefined, 403],
        ['/api/v1/users/me', 'wrong', 403],
        ['/api/v1/users/me', ORIGIN_SECRET.slice(0, -1), 403],
        ['/api/v1/users/me', `${ORIGIN_SECRET}x`, 403],
        ['/api/v1/users/me', ORIGIN_SECRET.toUpperCase(), 403],
        ['/api/v1/users/me', ORIGIN_SECRET, 200],
        ['/api/v1/auth/providers', undefined, 403],
        ['/api/v1/plans', undefined, 403],
        ['/api/v1/no-existe', undefined, 403],
        ['/api/v1/health', undefined, 200],
        ['/api/v1/health/', undefined, 200],
        ['/api/v1/health?x=1', undefined, 200],
        // Look-alikes of /health must not slip through.
        ['/api/v1/healthz', undefined, 403],
        ['/api/v1/health/../users/me', undefined, 403],
        ['/api/v1/health%2F..%2Fusers%2Fme', undefined, 403],
        ['/api/v1/users/me?/api/v1/health', undefined, 403],
        ['/API/V1/USERS/ME', undefined, 403],
      ];
      const failures: string[] = [];
      for (const [url, secret, expected] of cases) {
        const req = http().get(url).set('Authorization', bearer);
        if (secret !== undefined) req.set('x-origin-secret', secret);
        const res = await req;
        if (res.status !== expected) failures.push(`${url} [${secret ?? 'none'}] -> ${res.status}`);
      }
      expect(failures).toEqual([]);
    } finally {
      await guarded.app.close();
      process.env.ORIGIN_SECRET = '';
    }
  });

  it('SEC-CONF-08 /health exposes no versions, configuration or database details', async () => {
    const res = await request(server()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
    vi.spyOn(ctx.prisma, '$queryRaw').mockRejectedValueOnce(
      new Error(
        'connect ECONNREFUSED 10.0.0.5:5432 password authentication failed for user "neondb_owner"',
      ),
    );
    const down = await request(server()).get('/api/v1/health');
    expect(down.status).toBe(503);
    expect(JSON.stringify(down.body)).not.toMatch(/ECONNREFUSED|5432|neondb|password/);
  });

  // Finding SEC-F12 (informative): the API itself only sets Cache-Control on /auth/*; the
  // rest relies on the Vercel rewrite adding "no-store" (vercel.ts, checked in SEC-PROD-04).
  it.skip('SEC-CONF-09 every /api response with user data says Cache-Control: no-store, even without Vercel [SEC-F12]', async () => {
    for (const url of [
      '/api/v1/accounts',
      '/api/v1/users/me',
      '/api/v1/dashboard',
      '/api/v1/movements',
    ]) {
      const res = await as(ctx.app, s.a.user).get(url).expect(200);
      expect(res.headers['cache-control'], url).toMatch(/no-store/);
    }
  });

  it('SEC-CONF-11 the API refuses to start without its critical secrets or with short ones', () => {
    const base = {
      DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
      JWT_ACCESS_SECRET: 'k'.repeat(48),
      REFRESH_TOKEN_PEPPER: 'p'.repeat(48),
    };
    expect(() => loadEnv(base)).not.toThrow();
    for (const key of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'REFRESH_TOKEN_PEPPER'] as const) {
      const { [key]: _removed, ...rest } = base;
      expect(() => loadEnv(rest), key).toThrow(/Invalid environment variables/);
    }
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow();
    expect(() => loadEnv({ ...base, REFRESH_TOKEN_PEPPER: 'short' })).toThrow();
    expect(() => loadEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow();
  });

  // Finding SEC-F09: the placeholders of .env.example are 47 characters long and pass the
  // check, so a deploy that copies them signs tokens with a public secret.
  it.skip('SEC-CONF-11 the API refuses the known placeholder secrets of .env.example, in production [SEC-F09]', () => {
    const env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
      JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-characters',
      REFRESH_TOKEN_PEPPER: 'change-me-refresh-pepper-at-least-32-characters',
    };
    expect(() => loadEnv(env)).toThrow();
    expect(() => loadEnv({ ...env, JWT_ACCESS_SECRET: 'k'.repeat(48) })).toThrow();
    expect(() =>
      loadEnv({ ...env, JWT_ACCESS_SECRET: 'a'.repeat(48), REFRESH_TOKEN_PEPPER: 'a'.repeat(48) }),
    ).toThrow();
  });

  it('SEC-PRIV-02 no response carries password or token hashes or internal columns', async () => {
    const api = as(ctx.app, s.a.user);
    const urls = [
      '/api/v1/users/me',
      '/api/v1/accounts',
      `/api/v1/pockets/${s.a.ars.id}`,
      '/api/v1/movements?limit=100',
      `/api/v1/transactions/${s.a.transactionId}`,
      `/api/v1/transfers/${s.a.transferId}`,
      '/api/v1/cards',
      `/api/v1/charges/${s.a.charge.id}`,
      `/api/v1/statements/${s.a.closedStatement.id}`,
      '/api/v1/categories',
      '/api/v1/fixed',
      '/api/v1/goals',
      '/api/v1/investments',
      '/api/v1/auth/identities',
      '/api/v1/me/plan',
      '/api/v1/dashboard',
    ];
    const login = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: s.a.user.email, password: 'una-clave-segura' })
      .expect(200);
    const bodies = [login.body];
    for (const url of urls) bodies.push((await api.get(url).expect(200)).body);
    const text = JSON.stringify(bodies);
    for (const field of [
      'passwordHash',
      'tokenHash',
      'providerUserId',
      '"userId"',
      'argon2',
      'family',
    ]) {
      expect(text, field).not.toContain(field);
    }
  });
});
