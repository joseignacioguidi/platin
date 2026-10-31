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
      // As in production (measured on 2026-10-30): X-Forwarded-For arrives as
      // "<client>, <Vercel egress>, <Cloudflare edge>, <Render internal>", and Vercel puts the
      // real client IP in x-vercel-proxied-for, which the client cannot set (x-vercel-forwarded-for
      // sometimes kept a forged value).
      TRUST_PROXY_HOPS: '4',
      CLIENT_IP_HEADER: 'x-vercel-proxied-for',
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

  /** The chain production sends, with a different Cloudflare edge on every request. */
  const chain = (client: string, i: number) =>
    `${client},54.20.66.40, 172.71.151.${i}, 10.26.240.238`;
  const login = (headers: Record<string, string>) =>
    request(server())
      .post('/api/v1/auth/login')
      .set(headers)
      .send({ email: 'nadie@security.platin', password: 'una-clave-cualquiera' });

  // Was finding SEC-F01: with `trust proxy: true` the API took the client IP from the first
  // X-Forwarded-For entry, which the client controls, and Vercel forwards a forged one as is.
  // The fix counts on x-vercel-proxied-for, which Vercel always overwrites.
  it('SEC-AUTH-11 a client cannot reset the limit by forging X-Forwarded-For [SEC-F01]', async () => {
    const result: number[] = [];
    for (let i = 0; i <= AUTH_LIMIT * 2; i++) {
      const res = await login({
        'X-Forwarded-For': chain(`198.51.100.${i}`, i),
        'X-Vercel-Proxied-For': '203.0.113.200',
      });
      result.push(res.status);
    }
    expect(result.slice(0, AUTH_LIMIT)).toEqual(Array(AUTH_LIMIT).fill(401));
    expect(result.slice(AUTH_LIMIT)).toEqual(Array(AUTH_LIMIT + 1).fill(429));
  });

  // The regression of the first fix: with TRUST_PROXY_HOPS=2 the "client" was the Cloudflare
  // edge, different on every request, so nobody ever reached the limit. Without the Vercel
  // header, 4 hops find the real client in the same chain.
  it('SEC-AUTH-11 without the Vercel header, the real client is 4 hops from the right [SEC-F01]', async () => {
    const result: number[] = [];
    for (let i = 0; i <= AUTH_LIMIT; i++) {
      result.push((await login({ 'X-Forwarded-For': chain('203.0.113.201', i) })).status);
    }
    expect(result[AUTH_LIMIT]).toBe(429);
  });

  it('SEC-AUTH-11 each real client has its own limit [SEC-F01]', async () => {
    for (let i = 0; i < AUTH_LIMIT; i++) {
      await login({ 'X-Vercel-Proxied-For': '203.0.113.202' }).expect(401);
    }
    await login({ 'X-Vercel-Proxied-For': '203.0.113.202' }).expect(429);
    await login({ 'X-Vercel-Proxied-For': '203.0.113.203' }).expect(401);
  });
});
