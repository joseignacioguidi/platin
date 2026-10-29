import request from 'supertest';
import { as, refreshCookie, registerUser, TestUser } from '../../../test/auth-helpers';
import { FakeGoogleProvider } from '../../../test/fake-oauth';
import { createTestApp, resetDatabase, TestContext } from '../../../test/test-app';
import { ClockService } from '../../common/clock.service';

const APP = 'http://app.test';
const ENV = {
  PUBLIC_APP_URL: `${APP}/`,
  OAUTH_COOKIE_SECRET: 'test-oauth-cookie-secret-with-32-chars-or-more',
};

type SetCookie = string | string[] | undefined;

function cookieFrom(setCookie: SetCookie, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.find((value) => value.startsWith(`${name}=`));
}

describe('sign in with a provider (AUTH-06 to 08)', () => {
  let ctx: TestContext;
  let google: FakeGoogleProvider;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    google = new FakeGoogleProvider();
    ctx = await createTestApp(ENV, { oauthProviders: [google] });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /** GET /start: returns the state sent to the provider and the oauth_tx cookie. */
  async function start(query = '') {
    const res = await http().get(`/api/v1/auth/oauth/google/start${query}`).expect(302);
    const location = new URL(res.headers['location']);
    const setCookie = cookieFrom(res.headers['set-cookie'], 'oauth_tx');
    return {
      res,
      location,
      state: location.searchParams.get('state') ?? '',
      setCookie,
      txCookie: setCookie?.split(';')[0] ?? '',
    };
  }

  async function callback(query: string, txCookie?: string) {
    const req = http().get(`/api/v1/auth/oauth/google/callback${query}`);
    if (txCookie) req.set('Cookie', txCookie);
    return req.expect(302);
  }

  /** The whole round trip, as the browser would do it. */
  async function signIn(
    profile: { sub: string; email?: string | null; emailVerified?: boolean; name?: string },
    startQuery = '',
  ) {
    const { state, txCookie } = await start(startQuery);
    const code = google.code({
      providerUserId: profile.sub,
      email: profile.email === undefined ? `${profile.sub}@gmail.com` : profile.email,
      emailVerified: profile.emailVerified ?? true,
      name: profile.name ?? null,
    });
    return callback(`?code=${code}&state=${state}`, txCookie);
  }

  /** What /auth/listo does: trade the refresh cookie for an access token. */
  async function sessionOf(res: request.Response): Promise<TestUser> {
    const cookie = refreshCookie(res.headers['set-cookie']);
    const refreshed = await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    return {
      id: refreshed.body.user.id,
      email: refreshed.body.user.email,
      accessToken: refreshed.body.accessToken,
      cookie: refreshCookie(refreshed.headers['set-cookie']),
    };
  }

  describe('GET /auth/providers', () => {
    it('lists the enabled providers, never cached', async () => {
      const res = await http().get('/api/v1/auth/providers').expect(200);
      expect(res.body).toEqual({ providers: [{ provider: 'GOOGLE', slug: 'google' }] });
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('GET /auth/oauth/google/start', () => {
    it('redirects to the provider with a signed, short-lived oauth_tx cookie', async () => {
      const { location, state, setCookie } = await start('?returnTo=/app/tarjetas');
      expect(location.origin).toBe('https://idp.fake');
      expect(state).not.toBe('');
      // Built from PUBLIC_APP_URL (trailing slash trimmed), never from the request's host.
      expect(location.searchParams.get('redirect_uri')).toBe(
        `${APP}/api/v1/auth/oauth/google/callback`,
      );
      expect(setCookie).toMatch(/^oauth_tx=s%3A/); // signed
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Path=/api/v1/auth/oauth');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Max-Age=600');
    });

    it('sends an unknown provider back to /ingresar', async () => {
      const res = await http().get('/api/v1/auth/oauth/facebook/start').expect(302);
      expect(res.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_PROVIDER_DISABLED`);
    });
  });

  describe('GET /auth/oauth/google/callback', () => {
    it('creates an account with the usual onboarding and starts a session', async () => {
      const res = await signIn({ sub: 'g-ana', email: 'Ana@Gmail.com', name: 'Ana' });

      expect(res.headers['location']).toBe(`${APP}/auth/listo?returnTo=%2Fapp%2Fbienvenida`);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(cookieFrom(res.headers['set-cookie'], 'oauth_tx')).toMatch(/^oauth_tx=;/);
      // No token travels in the URL: only the httpOnly refresh cookie.
      expect(res.headers['location']).not.toMatch(/token/i);
      const session = await sessionOf(res);
      expect(session.email).toBe('ana@gmail.com');

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: session.id },
        include: { identities: true, accounts: true },
      });
      expect(user.passwordHash).toBeNull();
      expect(user.name).toBe('Ana');
      expect(user.identities).toMatchObject([
        { provider: 'GOOGLE', providerUserId: 'g-ana', email: 'ana@gmail.com' },
      ]);
      expect(user.accounts.map((a) => a.name)).toEqual(['Efectivo']);
      expect(await ctx.prisma.userPlan.count({ where: { userId: user.id } })).toBe(1);
    });

    it('signs in to the same account the second time, to the requested page', async () => {
      const first = await sessionOf(await signIn({ sub: 'g-ana' }));
      const second = await signIn(
        { sub: 'g-ana', email: 'nuevo-email@gmail.com' },
        '?returnTo=/app/tarjetas',
      );

      expect(second.headers['location']).toBe(`${APP}/auth/listo?returnTo=%2Fapp%2Ftarjetas`);
      expect((await sessionOf(second)).id).toBe(first.id);
      expect(await ctx.prisma.user.count()).toBe(1);
      const identity = await ctx.prisma.authIdentity.findFirstOrThrow();
      expect(identity.lastUsedAt).not.toBeNull();
      expect(identity.email).toBe('nuevo-email@gmail.com');
    });

    it('never returns outside the app (open redirect)', async () => {
      await signIn({ sub: 'g-ana' });
      for (const returnTo of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
        const res = await signIn({ sub: 'g-ana' }, `?returnTo=${encodeURIComponent(returnTo)}`);
        expect(res.headers['location']).toBe(`${APP}/auth/listo?returnTo=%2Fapp`);
      }
    });

    it('does not link an email that already has an account', async () => {
      await registerUser(ctx.app, { email: 'ana@gmail.com' });
      const res = await signIn({ sub: 'g-ana', email: 'ana@gmail.com' });

      expect(res.headers['location']).toBe(`${APP}/ingresar?error=ACCOUNT_EXISTS_LINK_REQUIRED`);
      expect(cookieFrom(res.headers['set-cookie'], 'platin_rt')).toBeUndefined();
      expect(await ctx.prisma.authIdentity.count()).toBe(0);
    });

    it('only accepts verified emails', async () => {
      const res = await signIn({ sub: 'g-ana', emailVerified: false });
      expect(res.headers['location']).toBe(`${APP}/ingresar?error=EMAIL_NOT_VERIFIED`);
      expect(await ctx.prisma.user.count()).toBe(0);
    });

    it('rejects a wrong or missing state, a tampered cookie and a cancelled sign-in', async () => {
      const { state, txCookie } = await start();
      const code = google.code({ providerUserId: 'g-ana', email: 'ana@gmail.com' });
      const invalid = `${APP}/ingresar?error=OAUTH_STATE_INVALID`;

      expect((await callback(`?code=${code}&state=otro`, txCookie)).headers['location']).toBe(
        invalid,
      );
      expect((await callback(`?code=${code}&state=${state}`)).headers['location']).toBe(invalid);
      const tampered = txCookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
      expect((await callback(`?code=${code}&state=${state}`, tampered)).headers['location']).toBe(
        invalid,
      );
      expect(
        (await callback(`?error=access_denied&state=${state}`, txCookie)).headers['location'],
      ).toBe(`${APP}/ingresar?error=OAUTH_CANCELLED`);
      expect(await ctx.prisma.user.count()).toBe(0);
    });

    it('rejects an expired sign-in (10 minutes)', async () => {
      const { state, txCookie } = await start();
      const code = google.code({ providerUserId: 'g-ana', email: 'ana@gmail.com' });
      const clock = ctx.app.get(ClockService);
      vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 10 * 60_000 + 1_000));
      const res = await callback(`?code=${code}&state=${state}`, txCookie);
      expect(res.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_STATE_INVALID`);
    });

    it('reports a failed code exchange', async () => {
      const { state, txCookie } = await start();
      const res = await callback(`?code=desconocido&state=${state}`, txCookie);
      expect(res.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_FAILED`);
    });

    it('applies suspension and closed registration', async () => {
      const ana = await sessionOf(await signIn({ sub: 'g-ana' }));
      await ctx.prisma.user.update({ where: { id: ana.id }, data: { status: 'SUSPENDED' } });
      expect((await signIn({ sub: 'g-ana' })).headers['location']).toBe(
        `${APP}/ingresar?error=ACCOUNT_SUSPENDED`,
      );

      await ctx.prisma.appSetting.create({ data: { key: 'registration', value: { open: false } } });
      expect((await signIn({ sub: 'g-beto' })).headers['location']).toBe(
        `${APP}/ingresar?error=REGISTRATION_CLOSED`,
      );
    });

    it('an account without password cannot sign in with one', async () => {
      await signIn({ sub: 'g-ana', email: 'ana@gmail.com' });
      const res = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'ana@gmail.com', password: 'cualquier-clave' })
        .expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('linking from the profile (AUTH-07)', () => {
    async function linkTicket(user: TestUser): Promise<string> {
      const res = await as(ctx.app, user).post('/api/v1/auth/oauth/google/link-ticket').expect(201);
      expect(res.body.expiresAt).toEqual(expect.any(String));
      return res.body.ticket as string;
    }

    async function link(user: TestUser, sub: string, email = `${sub}@gmail.com`) {
      const ticket = await linkTicket(user);
      const { state, txCookie } = await start(`?mode=link&ticket=${ticket}`);
      const code = google.code({ providerUserId: sub, email });
      return callback(`?code=${code}&state=${state}`, txCookie);
    }

    it('links Google to a password account; then both ways sign in', async () => {
      const ana = await registerUser(ctx.app, {
        email: 'ana@gmail.com',
        password: 'una-clave-segura',
      });
      const res = await link(ana, 'g-ana', 'ana@gmail.com');

      expect(res.headers['location']).toBe(`${APP}/app/perfil?vinculado=google`);
      expect(cookieFrom(res.headers['set-cookie'], 'platin_rt')).toBeUndefined();
      const viaGoogle = await signIn({ sub: 'g-ana', email: 'ana@gmail.com' });
      expect((await sessionOf(viaGoogle)).id).toBe(ana.id);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'ana@gmail.com', password: 'una-clave-segura' })
        .expect(200);

      const methods = await as(ctx.app, ana).get('/api/v1/auth/identities').expect(200);
      expect(methods.body).toEqual({
        hasPassword: true,
        identities: [
          {
            id: expect.any(String),
            provider: 'GOOGLE',
            email: 'ana@gmail.com',
            createdAt: expect.any(String),
            lastUsedAt: expect.any(String),
          },
        ],
      });
    });

    it('needs a session to ask for a ticket', async () => {
      await http().post('/api/v1/auth/oauth/google/link-ticket').expect(401);
    });

    it('a ticket works once and only for 60 seconds', async () => {
      const ana = await registerUser(ctx.app);
      const ticket = await linkTicket(ana);
      await start(`?mode=link&ticket=${ticket}`);
      const reused = await http()
        .get(`/api/v1/auth/oauth/google/start?mode=link&ticket=${ticket}`)
        .expect(302);
      expect(reused.headers['location']).toBe(`${APP}/app/perfil?error=LINK_TICKET_INVALID`);
      expect(cookieFrom(reused.headers['set-cookie'], 'oauth_tx')).toBeUndefined();

      const late = await linkTicket(ana);
      const clock = ctx.app.get(ClockService);
      vi.spyOn(clock, 'now').mockReturnValue(new Date(Date.now() + 61_000));
      const expired = await http()
        .get(`/api/v1/auth/oauth/google/start?mode=link&ticket=${late}`)
        .expect(302);
      expect(expired.headers['location']).toBe(`${APP}/app/perfil?error=LINK_TICKET_INVALID`);
    });

    it('rejects a Google account already linked to someone else', async () => {
      await signIn({ sub: 'g-ana' });
      const beto = await registerUser(ctx.app);
      const res = await link(beto, 'g-ana');
      expect(res.headers['location']).toBe(`${APP}/app/perfil?error=IDENTITY_IN_USE`);
    });

    it('rejects a second Google account on the same user', async () => {
      const ana = await registerUser(ctx.app);
      await link(ana, 'g-ana');
      const res = await link(ana, 'g-ana-2');
      expect(res.headers['location']).toBe(`${APP}/app/perfil?error=PROVIDER_ALREADY_LINKED`);
    });
  });

  describe('sign-in methods (AUTH-07, AUTH-08)', () => {
    it('cannot unlink the last way to sign in, until a password is set', async () => {
      const ana = await sessionOf(await signIn({ sub: 'g-ana', email: 'ana@gmail.com' }));
      const methods = await as(ctx.app, ana).get('/api/v1/auth/identities').expect(200);
      expect(methods.body.hasPassword).toBe(false);
      const identityId = methods.body.identities[0].id as string;

      const last = await as(ctx.app, ana)
        .delete(`/api/v1/auth/identities/${identityId}`)
        .expect(409);
      expect(last.body.code).toBe('LAST_SIGN_IN_METHOD');

      await as(ctx.app, ana).post('/api/v1/auth/password').send({ password: 'corta' }).expect(400);
      await as(ctx.app, ana)
        .post('/api/v1/auth/password')
        .send({ password: 'mi-nueva-clave-larga' })
        .expect(204);
      const again = await as(ctx.app, ana)
        .post('/api/v1/auth/password')
        .send({ password: 'otra-clave-larga' })
        .expect(409);
      expect(again.body.code).toBe('PASSWORD_ALREADY_SET');

      await as(ctx.app, ana).delete(`/api/v1/auth/identities/${identityId}`).expect(204);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'ana@gmail.com', password: 'mi-nueva-clave-larga' })
        .expect(200);
      // Unlinked: Google no longer opens the account by itself.
      expect((await signIn({ sub: 'g-ana', email: 'ana@gmail.com' })).headers['location']).toBe(
        `${APP}/ingresar?error=ACCOUNT_EXISTS_LINK_REQUIRED`,
      );
    });

    it("isolates users: B can't see or unlink A's identities", async () => {
      const ana = await sessionOf(await signIn({ sub: 'g-ana' }));
      const beto = await registerUser(ctx.app);
      const identity = await ctx.prisma.authIdentity.findFirstOrThrow({
        where: { userId: ana.id },
      });

      const list = await as(ctx.app, beto).get('/api/v1/auth/identities').expect(200);
      expect(list.body).toEqual({ hasPassword: true, identities: [] });
      const res = await as(ctx.app, beto)
        .delete(`/api/v1/auth/identities/${identity.id}`)
        .expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(await ctx.prisma.authIdentity.count()).toBe(1);
    });
  });
});

describe('sign in with a provider, without providers configured', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Without a provider there is no app address either (the plain Problem Details case).
    ctx = await createTestApp({ PUBLIC_APP_URL: '', OAUTH_COOKIE_SECRET: '' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('shows no buttons and rejects the flow', async () => {
    const server = ctx.app.getHttpServer();
    const res = await request(server).get('/api/v1/auth/providers').expect(200);
    expect(res.body).toEqual({ providers: [] });
    const flow = await request(server).get('/api/v1/auth/oauth/google/start').expect(404);
    expect(flow.body.code).toBe('OAUTH_PROVIDER_DISABLED');
  });
});
