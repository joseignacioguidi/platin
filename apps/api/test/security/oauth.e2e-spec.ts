import request from 'supertest';
import { ClockService } from '../../src/common/clock.service';
import { as, refreshCookie, registerUser, TestUser } from '../auth-helpers';
import { FAKE_ISSUER, FakeGoogleProvider } from '../fake-oauth';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { PASSWORD, SECURITY_ENV } from './seed';

const APP = 'https://platin.test';
const ENV = {
  ...SECURITY_ENV,
  PUBLIC_APP_URL: APP,
  OAUTH_COOKIE_SECRET: 'security-oauth-cookie-secret-with-32-chars-or-more',
};

function cookieFrom(setCookie: string | string[] | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.find((value) => value.startsWith(`${name}=`));
}

describe('security: sign-in with Google (fake provider, never Google)', () => {
  let ctx: TestContext;
  let google: FakeGoogleProvider;
  let ana: TestUser;

  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    google = new FakeGoogleProvider();
    ctx = await createTestApp(ENV, { oauthProviders: [google] });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    vi.restoreAllMocks();
    ana = await registerUser(ctx.app, { email: 'ana@security.platin', password: PASSWORD });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function start(query = '', headers: Record<string, string> = {}) {
    const req = http().get(`/api/v1/auth/oauth/google/start${query}`);
    for (const [name, value] of Object.entries(headers)) req.set(name, value);
    const res = await req.expect(302);
    const location = new URL(res.headers['location']);
    const setCookie = cookieFrom(res.headers['set-cookie'], 'oauth_tx');
    return {
      location,
      state: location.searchParams.get('state') ?? '',
      setCookie,
      txCookie: setCookie?.split(';')[0] ?? '',
    };
  }

  function callback(query: string, txCookie?: string) {
    const req = http().get(
      `/api/v1/auth/oauth/google/callback${query}&iss=${encodeURIComponent(FAKE_ISSUER)}`,
    );
    if (txCookie) req.set('Cookie', txCookie);
    return req.expect(302);
  }

  async function signIn(
    profile: { sub: string; email?: string; emailVerified?: boolean },
    startQuery = '',
    sessionCookie?: string,
  ) {
    const { state, txCookie } = await start(
      startQuery,
      sessionCookie ? { Cookie: sessionCookie } : {},
    );
    const code = google.code({
      providerUserId: profile.sub,
      email: profile.email ?? `${profile.sub}@gmail.com`,
      emailVerified: profile.emailVerified ?? true,
    });
    return callback(`?code=${code}&state=${state}`, txCookie);
  }

  const noSession = (res: request.Response) =>
    expect(cookieFrom(res.headers['set-cookie'], 'platin_rt')).toBeUndefined();

  async function ticketFor(user: TestUser): Promise<string> {
    const res = await as(ctx.app, user).post('/api/v1/auth/oauth/google/link-ticket').expect(201);
    return res.body.ticket as string;
  }

  it('SEC-OAUTH-01 callback without the cookie, with another state or with an expired cookie creates no session', async () => {
    const users = await ctx.prisma.user.count();

    const a = await start();
    const code = google.code({ providerUserId: 'g-1', email: 'g1@gmail.com' });
    const noCookie = await callback(`?code=${code}&state=${a.state}`);
    expect(noCookie.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_STATE_INVALID`);
    noSession(noCookie);

    const b = await start();
    const otherState = await callback(`?code=${code}&state=${a.state}`, b.txCookie);
    expect(otherState.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_STATE_INVALID`);
    noSession(otherState);

    const c = await start();
    const clock = ctx.app.get(ClockService);
    const real = clock.now();
    vi.spyOn(clock, 'now').mockReturnValue(new Date(real.getTime() + 10 * 60_000 + 1000));
    const expired = await callback(`?code=${code}&state=${c.state}`, c.txCookie);
    expect(expired.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_STATE_INVALID`);
    noSession(expired);

    expect(await ctx.prisma.user.count()).toBe(users);
  });

  it('SEC-OAUTH-02 a provider answer that fails verification (nonce, PKCE) creates no session', async () => {
    const { state, txCookie } = await start();
    // A code the fake provider never issued: like an id_token with the wrong nonce or
    // audience, the exchange throws and the callback must stop there.
    const res = await callback(`?code=forjado&state=${state}`, txCookie);
    expect(res.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_FAILED`);
    noSession(res);
  });

  it('SEC-OAUTH-03 oauth_tx is signed, HttpOnly, SameSite=Lax, scoped and short-lived; tampering invalidates it', async () => {
    const { setCookie, txCookie, state } = await start();
    expect(setCookie).toMatch(/^oauth_tx=s%3A/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth\/oauth(;|$)/);
    expect(setCookie).toMatch(/Max-Age=600/);

    // Keep the signature, change the payload: the returnTo of the transaction.
    const value = decodeURIComponent(txCookie.slice('oauth_tx='.length));
    const [payload, signature] = [
      value.slice(2, value.lastIndexOf('.')),
      value.slice(value.lastIndexOf('.') + 1),
    ];
    const forgedPayload = payload.replace('"returnTo":"/app"', '"returnTo":"//evil.example"');
    expect(forgedPayload).not.toBe(payload);
    const forged = `oauth_tx=${encodeURIComponent(`s:${forgedPayload}.${signature}`)}`;
    const code = google.code({ providerUserId: 'g-2', email: 'g2@gmail.com' });
    const res = await callback(`?code=${code}&state=${state}`, forged);
    expect(res.headers['location']).toBe(`${APP}/ingresar?error=OAUTH_STATE_INVALID`);
    noSession(res);

    // The callback always clears the cookie.
    const cleared = cookieFrom(res.headers['set-cookie'], 'oauth_tx');
    expect(cleared).toMatch(/^oauth_tx=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '%2F%2Fevil.com',
    'javascript:alert(1)',
    '/%09/evil.com',
    'http:evil.com',
    '\\\\evil.com',
  ])('SEC-OAUTH-04 returnTo=%s stays inside the app', async (returnTo) => {
    await ctx.prisma.authIdentity.create({
      data: { userId: ana.id, provider: 'GOOGLE', providerUserId: 'g-ana', email: ana.email },
    });
    const res = await signIn(
      { sub: 'g-ana', email: ana.email },
      `?returnTo=${encodeURIComponent(returnTo)}`,
    );
    const location = new URL(res.headers['location']);
    expect(location.origin).toBe(APP);
    expect(location.pathname).toBe('/auth/listo');
    const back = location.searchParams.get('returnTo') ?? '';
    // Either the fallback or a path that stays on the app's origin wherever it is resolved
    // ("/%09/evil.com" is a literal, harmless path: the tab is still percent-encoded).
    expect(back.startsWith('/')).toBe(true);
    expect(new URL(back, APP).origin).toBe(APP);
    expect(back).not.toMatch(/^\/[/\\]/);
  });

  it('SEC-OAUTH-05 the redirect URI and the final redirect come from PUBLIC_APP_URL, whatever the Host', async () => {
    const headers = {
      Host: 'evil.example',
      'X-Forwarded-Host': 'evil.example',
      'X-Forwarded-Proto': 'http',
    };
    const { location, state, txCookie } = await start('', headers);
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${APP}/api/v1/auth/oauth/google/callback`,
    );
    const code = google.code({ providerUserId: 'g-3', email: 'g3@gmail.com' });
    const res = await http()
      .get(
        `/api/v1/auth/oauth/google/callback?code=${code}&state=${state}&iss=${encodeURIComponent(FAKE_ISSUER)}`,
      )
      .set('Cookie', txCookie)
      .set(headers)
      .expect(302);
    expect(new URL(res.headers['location']).origin).toBe(APP);
  });

  it('SEC-OAUTH-06 a Google account with the email of an existing password account cannot take it over', async () => {
    const res = await signIn({ sub: 'g-attacker', email: 'ANA@security.platin' });
    expect(res.headers['location']).toBe(`${APP}/ingresar?error=ACCOUNT_EXISTS_LINK_REQUIRED`);
    noSession(res);
    expect(await ctx.prisma.authIdentity.count({ where: { userId: ana.id } })).toBe(0);
  });

  it('SEC-OAUTH-07 an unverified Google email is rejected', async () => {
    const res = await signIn({
      sub: 'g-unverified',
      email: 'nuevo@gmail.com',
      emailVerified: false,
    });
    expect(res.headers['location']).toBe(`${APP}/ingresar?error=EMAIL_NOT_VERIFIED`);
    noSession(res);
    expect(await ctx.prisma.user.count({ where: { email: 'nuevo@gmail.com' } })).toBe(0);
  });

  it('SEC-OAUTH-08 link tickets: invented, reused, expired or for another provider are rejected', async () => {
    const invented = await http()
      .get('/api/v1/auth/oauth/google/start?mode=link&ticket=inventado')
      .expect(302);
    expect(invented.headers['location']).toBe(`${APP}/app/perfil?error=LINK_TICKET_INVALID`);
    expect(cookieFrom(invented.headers['set-cookie'], 'oauth_tx')).toBeUndefined();

    const ticket = await ticketFor(ana);
    await start(`?mode=link&ticket=${ticket}`, { Cookie: ana.cookie });
    const reused = await http()
      .get(`/api/v1/auth/oauth/google/start?mode=link&ticket=${ticket}`)
      .expect(302);
    expect(reused.headers['location']).toBe(`${APP}/app/perfil?error=LINK_TICKET_INVALID`);

    const late = await ticketFor(ana);
    const clock = ctx.app.get(ClockService);
    const real = clock.now();
    vi.spyOn(clock, 'now').mockReturnValue(new Date(real.getTime() + 61_000));
    const expired = await http()
      .get(`/api/v1/auth/oauth/google/start?mode=link&ticket=${late}`)
      .expect(302);
    expect(expired.headers['location']).toBe(`${APP}/app/perfil?error=LINK_TICKET_INVALID`);
    vi.restoreAllMocks();

    // Tickets are only issued to signed-in users.
    await http().post('/api/v1/auth/oauth/google/link-ticket').expect(401);
  });

  // Was finding SEC-F04: the ticket alone decided which account got linked, so whoever opened
  // the link URL linked THEIR Google account to the ticket owner's platin account (link CSRF).
  it('SEC-OAUTH-08 a link ticket only works in the browser of the user who asked for it [SEC-F04]', async () => {
    const attacker = await registerUser(ctx.app, {
      email: 'atacante@security.platin',
      password: PASSWORD,
    });
    const victimLinks = async (cookie?: string) => {
      const ticket = await ticketFor(attacker);
      const req = http().get(`/api/v1/auth/oauth/google/start?mode=link&ticket=${ticket}`);
      if (cookie) req.set('Cookie', cookie);
      return req.expect(302);
    };
    // The victim's browser opens the attacker's link: without a session, or with their own.
    for (const res of [await victimLinks(), await victimLinks(ana.cookie)]) {
      expect(res.headers['location']).toBe(`${APP}/app/perfil?error=LINK_SESSION_MISMATCH`);
      expect(cookieFrom(res.headers['set-cookie'], 'oauth_tx')).toBeUndefined();
    }
    // A logged-out (revoked) session of the attacker does not count either.
    const ticket = await ticketFor(attacker);
    await http().post('/api/v1/auth/logout').set('Cookie', attacker.cookie).expect(204);
    const revoked = await http()
      .get(`/api/v1/auth/oauth/google/start?mode=link&ticket=${ticket}`)
      .set('Cookie', attacker.cookie)
      .expect(302);
    expect(revoked.headers['location']).toBe(`${APP}/app/perfil?error=LINK_SESSION_MISMATCH`);
    expect(await ctx.prisma.authIdentity.count({ where: { userId: attacker.id } })).toBe(0);
  });

  it('SEC-OAUTH-09 an identity linked to A cannot be linked to B; A keeps it', async () => {
    await ctx.prisma.authIdentity.create({
      data: { userId: ana.id, provider: 'GOOGLE', providerUserId: 'g-ana', email: ana.email },
    });
    const beto = await registerUser(ctx.app, { email: 'beto@security.platin', password: PASSWORD });
    const ticket = await ticketFor(beto);
    const res = await signIn(
      { sub: 'g-ana', email: ana.email },
      `?mode=link&ticket=${ticket}`,
      beto.cookie,
    );
    expect(res.headers['location']).toBe(`${APP}/app/perfil?error=IDENTITY_IN_USE`);
    const identity = await ctx.prisma.authIdentity.findFirstOrThrow({
      where: { providerUserId: 'g-ana' },
    });
    expect(identity.userId).toBe(ana.id);
    expect(await ctx.prisma.authIdentity.count({ where: { userId: beto.id } })).toBe(0);
  });

  it('SEC-OAUTH-10 the last sign-in method cannot be removed', async () => {
    const res = await signIn({ sub: 'g-solo', email: 'solo@gmail.com' });
    const cookie = refreshCookie(res.headers['set-cookie']);
    const refreshed = await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200);
    const solo = {
      id: refreshed.body.user.id,
      email: 'solo@gmail.com',
      accessToken: refreshed.body.accessToken,
      cookie,
    };
    const identities = (await as(ctx.app, solo).get('/api/v1/auth/identities').expect(200)).body;
    const removal = await as(ctx.app, solo).delete(
      `/api/v1/auth/identities/${identities.identities[0].id}`,
    );
    expect(removal.status).toBe(409);
    expect(removal.body.code).toBe('LAST_SIGN_IN_METHOD');
  });

  it('SEC-OAUTH-11 removing an identity of another user is a 404', async () => {
    const identity = await ctx.prisma.authIdentity.create({
      data: { userId: ana.id, provider: 'GOOGLE', providerUserId: 'g-ana', email: ana.email },
    });
    const beto = await registerUser(ctx.app, { email: 'beto@security.platin', password: PASSWORD });
    await as(ctx.app, beto).delete(`/api/v1/auth/identities/${identity.id}`).expect(404);
    expect(await ctx.prisma.authIdentity.count({ where: { id: identity.id } })).toBe(1);
  });

  it('SEC-OAUTH-12 no access or refresh token ever travels in a redirect URL', async () => {
    const res = await signIn(
      { sub: 'g-new', email: 'nuevo2@gmail.com' },
      '?returnTo=/app/tarjetas',
    );
    const location: string = res.headers['location'];
    const cookie = refreshCookie(res.headers['set-cookie']);
    const token = decodeURIComponent(cookie.split('=')[1]);
    expect(location).not.toContain(token);
    expect(location).not.toMatch(/token|eyJ/i);
    expect(new URL(location).pathname).toBe('/auth/listo');
    // The provider gets PKCE (challenge only), state and nonce; never a platin token.
    const { location: providerUrl } = await start();
    expect(providerUrl.href).not.toMatch(/eyJ|platin_rt/);
  });
});
