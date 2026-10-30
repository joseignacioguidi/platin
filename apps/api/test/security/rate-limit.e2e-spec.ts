import request from 'supertest';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { PASSWORD, SECURITY_ENV } from './seed';
import { registerUser } from '../auth-helpers';

const AUTH_LIMIT = 3;
const GENERAL_LIMIT = 6;

/** Each test uses its own client IP, so the per-IP counters don't leak between tests. */
let ip = 0;
const nextIp = () => `203.0.113.${++ip}`;

describe('security: rate limiting', () => {
  let ctx: TestContext;

  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp({
      ...SECURITY_ENV,
      THROTTLE_AUTH_LIMIT: String(AUTH_LIMIT),
      THROTTLE_LIMIT: String(GENERAL_LIMIT),
      // As in production: Vercel and Render each append one X-Forwarded-For entry.
      TRUST_PROXY_HOPS: '2',
    });
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /** Statuses of `count` sequential requests from one IP. */
  async function statuses(count: number, send: (clientIp: string) => request.Test) {
    const clientIp = nextIp();
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push((await send(clientIp)).status);
    return result;
  }

  it('SEC-AUTH-11 /auth/login answers 429 past the credential limit', async () => {
    const result = await statuses(AUTH_LIMIT + 1, (clientIp) =>
      request(server())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send({ email: 'nadie@security.platin', password: 'una-clave-cualquiera' }),
    );
    expect(result.slice(0, AUTH_LIMIT)).toEqual(Array(AUTH_LIMIT).fill(401));
    expect(result[AUTH_LIMIT]).toBe(429);
  });

  it('SEC-AUTH-11 /auth/register answers 429 past the credential limit', async () => {
    const result = await statuses(AUTH_LIMIT + 1, (clientIp) =>
      request(server())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', clientIp)
        .send({ email: 'corta@security.platin', password: 'x' }),
    );
    expect(result[AUTH_LIMIT]).toBe(429);
  });

  it('SEC-AUTH-11 /auth/refresh answers 429 past the general limit (not the credential one)', async () => {
    const result = await statuses(GENERAL_LIMIT + 1, (clientIp) =>
      request(server()).post('/api/v1/auth/refresh').set('X-Forwarded-For', clientIp),
    );
    expect(result.slice(0, GENERAL_LIMIT)).toEqual(Array(GENERAL_LIMIT).fill(401));
    expect(result[GENERAL_LIMIT]).toBe(429);
  });

  it('SEC-AUTH-11 the limit is per IP and a 429 is Problem Details', async () => {
    const user = await registerUser(ctx.app, { password: PASSWORD });
    const clientIp = nextIp();
    let last: request.Response | undefined;
    for (let i = 0; i <= AUTH_LIMIT; i++) {
      last = await request(server())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send({ email: user.email, password: 'una-clave-cualquiera' });
    }
    expect(last?.status).toBe(429);
    expect(last?.body.code).toBe('TOO_MANY_REQUESTS');
    expect(last?.headers['content-type']).toMatch(/application\/problem\+json/);
    // The right password from the blocked IP is still blocked (no oracle while limited).
    await request(server())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', clientIp)
      .send({ email: user.email, password: PASSWORD })
      .expect(429);
  });

  // Was finding SEC-F01: with `trust proxy: true` the API took the client IP from the first
  // X-Forwarded-For entry, which the client controls. Rotating it bypassed the limit.
  it('SEC-AUTH-11 a client cannot reset the limit by forging X-Forwarded-For [SEC-F01]', async () => {
    const result: number[] = [];
    for (let i = 0; i <= AUTH_LIMIT * 2; i++) {
      const res = await request(server())
        .post('/api/v1/auth/login')
        // What a client would send through Vercel and Render: a forged first entry, then the
        // proxies' own entries (the same for every request).
        .set('X-Forwarded-For', `198.51.100.${i}, 192.0.2.10, 192.0.2.20`)
        .send({ email: 'nadie@security.platin', password: 'una-clave-cualquiera' });
      result.push(res.status);
    }
    expect(result).toContain(429);
  });
});
