import request from 'supertest';
import { refreshCookie, registerUser } from '../../test/auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('auth', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('POST /auth/register', () => {
    it('creates the user, returns an access token and sets the refresh cookie', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'Jose@Platin.app', password: 'una-clave-segura', name: 'José' })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: 'jose@platin.app',
        name: 'José',
        baseCurrency: 'ARS',
        valuationRate: 'MEP',
      });
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^platin_rt=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('SameSite=Lax');

      const stored = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'jose@platin.app' },
      });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      const tokens = await ctx.prisma.refreshToken.findMany();
      expect(tokens).toHaveLength(1);
      expect(cookie).not.toContain(tokens[0].tokenHash);
    });

    it('rejects passwords shorter than 10 characters', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'a@b.co', password: '123456789' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(res.body.errors[0].path).toBe('password');
    });

    it('rejects a duplicated email', async () => {
      await registerUser(ctx.app, { email: 'dup@platin.app' });
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'DUP@platin.app', password: 'otra-clave-larga' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with the right password', async () => {
      await registerUser(ctx.app, { email: 'login@platin.app', password: 'una-clave-segura' });
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'login@platin.app', password: 'una-clave-segura' })
        .expect(200);
      expect(res.body.user.email).toBe('login@platin.app');
      expect(refreshCookie(res.headers['set-cookie'])).toMatch(/^platin_rt=/);
    });

    it('rejects a wrong password or unknown email with the same error', async () => {
      await registerUser(ctx.app, { email: 'login@platin.app' });
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'login@platin.app', password: 'incorrecta-123' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'nadie@platin.app', password: 'incorrecta-123' })
        .expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and returns a new access token', async () => {
      const user = await registerUser(ctx.app);
      const res = await http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(200);
      expect(res.body.user.id).toBe(user.id);
      const next = refreshCookie(res.headers['set-cookie']);
      expect(next).not.toBe(user.cookie);

      // The new access token works.
      await request(ctx.app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      // And the new refresh token can be used again.
      await http().post('/api/v1/auth/refresh').set('Cookie', next).expect(200);
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const user = await registerUser(ctx.app);
      const rotated = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.cookie)
        .expect(200);
      const next = refreshCookie(rotated.headers['set-cookie']);

      const reuse = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.cookie)
        .expect(401);
      expect(reuse.body.code).toBe('SESSION_REUSED');

      // The legitimate latest token is revoked too: the user has to log in again.
      const after = await http().post('/api/v1/auth/refresh').set('Cookie', next).expect(401);
      expect(after.body.code).toBe('SESSION_REUSED');
      const active = await ctx.prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(0);
    });

    it('rejects a missing or unknown token', async () => {
      expect((await http().post('/api/v1/auth/refresh').expect(401)).body.code).toBe(
        'SESSION_INVALID',
      );
      await http().post('/api/v1/auth/refresh').set('Cookie', 'platin_rt=nope').expect(401);
    });

    it('rejects an expired token', async () => {
      const user = await registerUser(ctx.app);
      await ctx.prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the family and clears the cookie', async () => {
      const user = await registerUser(ctx.app);
      const res = await http().post('/api/v1/auth/logout').set('Cookie', user.cookie).expect(204);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^platin_rt=;/);
      await http().post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
    });
  });

  describe('global guard', () => {
    it('requires an access token outside /auth and /health', async () => {
      const res = await http().get('/api/v1/users/me').expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      await http().get('/api/v1/users/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });
  });
});

describe('auth throttling', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestApp({ THROTTLE_AUTH_LIMIT: '5' });
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('allows 5 attempts per minute on /auth/*', async () => {
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'x@platin.app', password: 'incorrecta' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    // Other routes are not affected by the auth limit.
    await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('does not apply the strict limit to refresh (it runs on every app open)', async () => {
    let cookie = (await registerUser(ctx.app)).cookie;
    for (let i = 0; i < 8; i++) {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      cookie = refreshCookie(res.headers['set-cookie']);
    }
  });
});
