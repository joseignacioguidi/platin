import request from 'supertest';
import { as, refreshCookie, registerUser } from '../auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { decodeJwt, nowSeconds, signJwt, unsignedJwt } from './jwt';
import { ADMIN_EMAIL, login, PASSWORD, Scenario, seedScenario, SECURITY_ENV } from './seed';

const ME = '/api/v1/users/me';

describe('security: authentication and sessions', () => {
  let ctx: TestContext;
  let s: Scenario;

  const server = () => ctx.app.getHttpServer();
  const secret = () => process.env.JWT_ACCESS_SECRET as string;
  const refresh = (cookie?: string) => {
    const req = request(server()).post('/api/v1/auth/refresh');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    ctx = await createTestApp(SECURITY_ENV);
    await resetDatabase(ctx.prisma);
    s = await seedScenario(ctx.app, ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('access token', () => {
    const withToken = (token: string, scheme = 'Bearer') =>
      request(server()).get(ME).set('Authorization', `${scheme} ${token}`);

    it('SEC-AUTH-01 missing, malformed, tampered and alg:none tokens get 401', async () => {
      const valid = s.a.user.accessToken;
      const [header, payload, signature] = valid.split('.');
      const flipped = signature.slice(0, -2) + (signature.endsWith('AA') ? 'BB' : 'AA');
      const otherPayload = Buffer.from(
        JSON.stringify({ ...decodeJwt(valid), sub: s.b.user.id }),
      ).toString('base64url');

      await request(server()).get(ME).expect(401);
      for (const token of [
        'garbage',
        'a.b.c',
        `${header}.${payload}`,
        `${header}.${payload}.${flipped}`,
        `${header}.${otherPayload}.${signature}`,
        unsignedJwt({ sub: s.a.user.id, role: 'USER', exp: nowSeconds() + 600 }),
        signJwt({ sub: s.a.user.id, exp: nowSeconds() + 600 }, '', { alg: 'none', typ: 'JWT' }),
      ]) {
        const res = await withToken(token);
        expect(res.status, token).toBe(401);
        expect(res.body.code).toBe('UNAUTHORIZED');
      }
      // A valid token with the wrong scheme.
      await withToken(valid, 'Basic').expect(401);
      await withToken(valid, 'bearer').expect(401);
    });

    it('SEC-AUTH-02 an expired token gets 401', async () => {
      const expired = signJwt(
        { sub: s.a.user.id, role: 'USER', iat: nowSeconds() - 3600, exp: nowSeconds() - 60 },
        secret(),
      );
      await withToken(expired).expect(401);
      // Sanity check: the same claims with a future exp are accepted, so the 401 is the expiry.
      const fresh = signJwt(
        { sub: s.a.user.id, role: 'USER', iat: nowSeconds(), exp: nowSeconds() + 60 },
        secret(),
      );
      await withToken(fresh).expect(200);
    });

    it('SEC-AUTH-02 access tokens last 15 minutes', () => {
      const { iat, exp } = decodeJwt(s.a.user.accessToken) as { iat: number; exp: number };
      expect(exp - iat).toBe(15 * 60);
    });

    it('SEC-AUTH-03 a token signed with another secret gets 401', async () => {
      const forged = signJwt(
        { sub: s.a.user.id, role: 'USER', exp: nowSeconds() + 600 },
        'another-secret-with-at-least-32-characters!!',
      );
      await withToken(forged).expect(401);
    });

    it('SEC-AUTH-04 a token of A re-signed with sub=B and a fake secret gets 401', async () => {
      const claims = { ...decodeJwt(s.a.user.accessToken), sub: s.b.user.id };
      await withToken(signJwt(claims, 'fake-secret-fake-secret-fake-secret!!')).expect(401);
      await withToken(signJwt(claims, '')).expect(401);
      // Same claims with HS512 and HS384 under a guessable key.
      await withToken(signJwt(claims, 'secret', { alg: 'HS512', typ: 'JWT' })).expect(401);
    });
  });

  describe('refresh cookie and rotation', () => {
    it('SEC-AUTH-05 the refresh cookie is HttpOnly, SameSite=Lax and scoped to /api/v1/auth', async () => {
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: s.a.user.email, password: PASSWORD })
        .expect(200);
      const cookie = ([] as string[])
        .concat(res.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('platin_rt='));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(cookie).toMatch(/;\s*Path=\/api\/v1\/auth(;|$)/i);
      // Local (NODE_ENV=test) does not set Secure; production does (checked below).
      expect(cookie).not.toMatch(/;\s*Secure/i);
    });

    it('SEC-AUTH-05 in production the refresh cookie is also Secure', async () => {
      // Production refuses placeholder secrets and a missing ORIGIN_SECRET (SEC-F09).
      const saved = { ...process.env };
      const prod = await createTestApp({
        ...SECURITY_ENV,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'prod-like-access-secret-0123456789abcdef',
        REFRESH_TOKEN_PEPPER: 'prod-like-refresh-pepper-0123456789abcdef',
        ALLOW_DIRECT_ACCESS: 'true',
        TRUST_PROXY_HOPS: '0',
      });
      try {
        const res = await request(prod.app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: s.a.user.email, password: PASSWORD })
          .expect(200);
        const cookie = ([] as string[])
          .concat(res.headers['set-cookie'] ?? [])
          .find((c) => c.startsWith('platin_rt='));
        expect(cookie).toMatch(/;\s*Secure/i);
        expect(cookie).toMatch(/;\s*HttpOnly/i);
      } finally {
        await prod.app.close();
        process.env = saved;
      }
    });

    it('SEC-AUTH-06 reusing a refresh token revokes the whole family, including the new token', async () => {
      const session = await login(ctx.app, s.a.user.email);
      const first = await refresh(session.cookie).expect(200);
      const rotated = refreshCookie(first.headers['set-cookie']);
      expect(rotated).not.toBe(session.cookie);

      const reuse = await refresh(session.cookie).expect(401);
      expect(reuse.body.code).toBe('SESSION_REUSED');
      // The token issued on the first use is dead too.
      const after = await refresh(rotated).expect(401);
      expect(after.body.code).toBe('SESSION_REUSED');
    });

    it('SEC-AUTH-06 two refreshes racing with the same token: at most one wins', async () => {
      const session = await login(ctx.app, s.a.user.email);
      const results = await Promise.all([refresh(session.cookie), refresh(session.cookie)]);
      const ok = results.filter((r) => r.status === 200);
      expect(ok.length).toBeLessThanOrEqual(1);
    });

    it('SEC-AUTH-07 after logout the previous refresh token gets 401', async () => {
      const session = await login(ctx.app, s.a.user.email);
      const logout = await request(server())
        .post('/api/v1/auth/logout')
        .set('Cookie', session.cookie)
        .expect(204);
      expect(([] as string[]).concat(logout.headers['set-cookie'] ?? []).join()).toMatch(
        /platin_rt=;/,
      );
      await refresh(session.cookie).expect(401);
    });

    it('SEC-AUTH-07 a refresh without a cookie, or with an invented one, gets 401', async () => {
      await refresh().expect(401);
      await refresh('platin_rt=inventado').expect(401);
      await refresh(`platin_rt=${'A'.repeat(43)}`).expect(401);
    });

    it('SEC-AUTH-08 refresh tokens are stored only as a hash', async () => {
      const session = await login(ctx.app, s.a.user.email);
      const token = decodeURIComponent(session.cookie.split('=')[1]);
      const rows = await ctx.prisma.refreshToken.findMany({ where: { userId: s.a.user.id } });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tokenHash).not.toBe(token);
        expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(rows.some((row) => row.tokenHash.includes(token))).toBe(false);
    });
  });

  describe('passwords and enumeration', () => {
    it('SEC-AUTH-09 passwords are hashed with argon2id', async () => {
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: s.a.user.id } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(row.passwordHash).not.toContain(PASSWORD);
    });

    it('SEC-AUTH-09 passwords shorter than 10 characters are rejected on sign-up and on set-password', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'corta@security.platin', password: '123456789' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'corta@security.platin', password: ' '.repeat(9) })
        .expect(400);

      // "Definir contraseña" of a Google-only user, via a session started by Google.
      const session = await ctx.app
        .get((await import('../../src/auth/auth.service')).AuthService)
        .startSession(s.googleOnly.id);
      const googleUser = {
        ...s.a.user,
        id: s.googleOnly.id,
        accessToken: session.response.accessToken,
      };
      await as(ctx.app, googleUser)
        .post('/api/v1/auth/password')
        .send({ password: 'corta' })
        .expect(400);
      const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: s.googleOnly.id } });
      expect(row.passwordHash).toBeNull();
    });

    it('SEC-AUTH-10 login answers the same for an unknown email and a wrong password', async () => {
      const unknown = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: 'nadie@security.platin', password: 'una-clave-cualquiera' });
      const wrong = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: s.a.user.email, password: 'una-clave-cualquiera' });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('SEC-AUTH-10 sign-up with a taken email reveals that it exists (documented: EMAIL_TAKEN)', async () => {
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: s.a.user.email.toUpperCase(), password: 'otra-clave-segura' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
      // It reveals only that: no id, name or creation date.
      expect(Object.keys(res.body).sort()).toEqual(['code', 'detail', 'status', 'title', 'type']);
    });

    it('SEC-AUTH-14 a password login to a Google-only account gets the generic invalid-credentials error', async () => {
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: s.googleOnly.email, password: 'una-clave-cualquiera' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('suspended and deleted users', () => {
    it('SEC-AUTH-13 a suspended user cannot sign in, even with the right password', async () => {
      const res = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: s.suspended.email, password: PASSWORD })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
      // A wrong password does not reveal the suspension.
      const wrong = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: s.suspended.email, password: 'una-clave-cualquiera' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('SEC-AUTH-13 suspending a user kills their refresh token', async () => {
      const victim = await registerUser(ctx.app, { password: PASSWORD });
      const admin = await login(ctx.app, ADMIN_EMAIL);
      await as(ctx.app, admin).post(`/api/v1/admin/users/${victim.id}/suspend`).expect(200);
      await refresh(victim.cookie).expect(401);
    });

    // Was finding SEC-F02: the access token kept working until it expired (up to 15 minutes),
    // because the JWT guard did not look at the user's status.
    it('SEC-AUTH-13 suspending a user also stops their current access token [SEC-F02]', async () => {
      const victim = await registerUser(ctx.app, { password: PASSWORD });
      const admin = await login(ctx.app, ADMIN_EMAIL);
      await as(ctx.app, admin).post(`/api/v1/admin/users/${victim.id}/suspend`).expect(200);
      const res = await as(ctx.app, victim).get(ME).expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      // Reactivated, the same token works again (it was never revoked, only refused).
      await as(ctx.app, admin).post(`/api/v1/admin/users/${victim.id}/reactivate`).expect(200);
      await as(ctx.app, victim).get(ME).expect(200);
    });

    // Was finding SEC-F03: the write hit the foreign key of the deleted user and answered 500.
    it('SEC-AUTH-13 a deleted user with a still valid access token cannot read or write anything [SEC-F03]', async () => {
      const victim = await registerUser(ctx.app, { password: PASSWORD });
      const admin = await login(ctx.app, ADMIN_EMAIL);
      await as(ctx.app, admin)
        .delete(`/api/v1/admin/users/${victim.id}`)
        .send({ confirmEmail: victim.email })
        .expect(204);
      const api = as(ctx.app, victim);
      const me = await api.get(ME);
      expect(me.status).toBe(401);
      const write = await api
        .post('/api/v1/categories')
        .send({ name: 'Fantasma', kind: 'EXPENSE', icon: 'paw-print', color: 'card' });
      expect(write.status).toBe(401);
      expect(await ctx.prisma.category.count({ where: { userId: victim.id } })).toBe(0);
    });
  });

  describe('headers', () => {
    it('SEC-AUTH-15 every /auth response carries Cache-Control: no-store', async () => {
      const session = await login(ctx.app, s.a.user.email);
      const responses = [
        await request(server())
          .post('/api/v1/auth/login')
          .send({ email: s.a.user.email, password: PASSWORD }),
        await request(server()).post('/api/v1/auth/login').send({ email: 'x@y.z', password: 'x' }),
        await request(server())
          .post('/api/v1/auth/register')
          .send({ email: `nuevo-${Date.now()}@security.platin`, password: PASSWORD }),
        await refresh(session.cookie),
        await refresh(),
        await request(server()).post('/api/v1/auth/logout'),
        await request(server()).get('/api/v1/auth/providers'),
        await as(ctx.app, s.a.user).get('/api/v1/auth/identities'),
        await request(server()).get('/api/v1/auth/oauth/google/start'),
      ];
      for (const [i, res] of responses.entries()) {
        expect(res.headers['cache-control'], `response ${i}`).toBe('no-store');
      }
    });
  });
});
