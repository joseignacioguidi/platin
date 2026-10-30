import request from 'supertest';
import { as, registerUser, TestUser } from '../auth-helpers';
import { FAKE_ISSUER, FakeGoogleProvider } from '../fake-oauth';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { decodeJwt, nowSeconds, signJwt } from './jwt';
import {
  ADMIN_EMAIL,
  login,
  PASSWORD,
  Scenario,
  seedScenario,
  seedVictim,
  SECURITY_ENV,
} from './seed';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Every admin endpoint, with a body that passes validation. */
function adminEndpoints(s: Scenario, planId: string): [Method, string, object?][] {
  const target = s.b.user.id;
  return [
    ['get', '/api/v1/admin/metrics'],
    ['get', '/api/v1/admin/users'],
    ['get', `/api/v1/admin/users/${target}`],
    ['post', `/api/v1/admin/users/${target}/suspend`],
    ['post', `/api/v1/admin/users/${target}/reactivate`],
    ['post', `/api/v1/admin/users/${target}/logout`],
    ['delete', `/api/v1/admin/users/${target}`, { confirmEmail: s.b.user.email }],
    ['get', '/api/v1/admin/settings/registration'],
    ['put', '/api/v1/admin/settings/registration', { value: { open: false } }],
    ['get', '/api/v1/admin/audit'],
    ['get', '/api/v1/admin/plans'],
    [
      'post',
      '/api/v1/admin/plans',
      {
        key: 'hack',
        name: 'Hack',
        limits: {
          maxAccounts: null,
          maxPockets: null,
          maxCards: null,
          maxGoals: null,
          maxFixed: null,
          investments: true,
        },
      },
    ],
    ['patch', `/api/v1/admin/plans/${planId}`, { name: 'Hack' }],
    ['post', `/api/v1/admin/users/${target}/plan`, { planId }],
    ['get', '/api/v1/admin/plan-requests'],
    ['post', `/api/v1/admin/plan-requests/${planId}/approve`],
    ['post', `/api/v1/admin/plan-requests/${planId}/reject`],
  ];
}

/** Row count of every table of the public schema. */
async function tableCounts(ctx: TestContext): Promise<Record<string, number>> {
  const tables = await ctx.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const [row] = await ctx.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM "public"."${tablename.replace(/"/g, '')}"`,
    );
    counts[tablename] = Number(row.count);
  }
  return counts;
}

describe('security: administration', () => {
  let ctx: TestContext;
  let s: Scenario;
  let admin: TestUser;
  let proPlanId: string;

  const server = () => ctx.app.getHttpServer();
  const asAdmin = () => as(ctx.app, admin);

  beforeAll(async () => {
    ctx = await createTestApp(SECURITY_ENV);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    s = await seedScenario(ctx.app, ctx.prisma);
    admin = await login(ctx.app, ADMIN_EMAIL);
    proPlanId = (await ctx.prisma.plan.findUniqueOrThrow({ where: { key: 'pro' } })).id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('SEC-ADM-01 a common user gets 403 on every admin endpoint and nothing changes', async () => {
    const before = await tableCounts(ctx);
    const failures: string[] = [];
    for (const [method, url, body] of adminEndpoints(s, proPlanId)) {
      const req = as(ctx.app, s.a.user)[method](url);
      const res = await (body ? req.send(body) : req);
      if (res.status !== 403) failures.push(`${method.toUpperCase()} ${url} -> ${res.status}`);
      const anonymous = request(server())[method](url);
      const anon = await (body ? anonymous.send(body) : anonymous);
      if (anon.status !== 401)
        failures.push(`anonymous ${method.toUpperCase()} ${url} -> ${anon.status}`);
    }
    expect(failures).toEqual([]);
    expect(await tableCounts(ctx)).toEqual(before);
  });

  it('SEC-ADM-02 a token with role ADMIN re-signed with a fake secret gets 401', async () => {
    const claims = { ...decodeJwt(s.a.user.accessToken), role: 'ADMIN', exp: nowSeconds() + 600 };
    await request(server())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${signJwt(claims, 'fake-secret-fake-secret-fake-secret!!')}`)
      .expect(401);
  });

  it('SEC-ADM-02 even a validly signed token with role ADMIN does not make a user admin', async () => {
    // Defense in depth: the guard reads the role from the database, not from the claim.
    const claims = { ...decodeJwt(s.a.user.accessToken), role: 'ADMIN', exp: nowSeconds() + 600 };
    const token = signJwt(claims, process.env.JWT_ACCESS_SECRET as string);
    await request(server())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('SEC-ADM-03 an admin who lost the role in the database gets 403 with the old token', async () => {
    await asAdmin().get('/api/v1/admin/users').expect(200);
    await ctx.prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    await asAdmin().get('/api/v1/admin/users').expect(403);
    // A suspended admin is out too.
    await ctx.prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN', status: 'SUSPENDED' },
    });
    await asAdmin().get('/api/v1/admin/users').expect(403);
  });

  it('SEC-ADM-04 no admin response contains amounts, balances, descriptions, categories or account names', async () => {
    const bodies: unknown[] = [];
    for (const [method, url] of adminEndpoints(s, proPlanId).filter(([m]) => m === 'get')) {
      bodies.push((await asAdmin()[method](url).expect(200)).body);
    }
    bodies.push((await asAdmin().get(`/api/v1/admin/users/${s.a.user.id}`).expect(200)).body);
    bodies.push((await asAdmin().get('/api/v1/admin/users?q=ana').expect(200)).body);
    const text = JSON.stringify(bodies);
    for (const secret of [
      'Alimento',
      'Heladera',
      'Alquiler',
      'Mascotas',
      'CEDEARs',
      'Dólares',
      s.a.account.name,
      '1000000',
      '90000',
      '110000',
      '300000',
    ]) {
      expect(text).not.toContain(secret);
    }
    // ("description" appears only as the plan's own description, which is not user data.)
    for (const field of [
      '"amount"',
      '"balance"',
      '"categoryId"',
      '"pocketId"',
      '"totalAmount"',
      '"passwordHash"',
      '"tokenHash"',
    ]) {
      expect(text).not.toContain(field);
    }
  });

  it('SEC-ADM-05 every admin change is audited; a failed one leaves no audit entry', async () => {
    const count = () => ctx.prisma.auditLog.count();
    let audits = await count();
    const changes: [Method, string, object?][] = [
      ['post', `/api/v1/admin/users/${s.b.user.id}/suspend`],
      ['post', `/api/v1/admin/users/${s.b.user.id}/reactivate`],
      ['post', `/api/v1/admin/users/${s.b.user.id}/logout`],
      ['put', '/api/v1/admin/settings/registration', { value: { open: true } }],
      ['post', `/api/v1/admin/users/${s.b.user.id}/plan`, { planId: proPlanId }],
      ['patch', `/api/v1/admin/plans/${proPlanId}`, { name: 'Pro+' }],
      ['delete', `/api/v1/admin/users/${s.b.user.id}`, { confirmEmail: s.b.user.email }],
    ];
    for (const [method, url, body] of changes) {
      const req = asAdmin()[method](url);
      const res = await (body ? req.send(body) : req);
      expect(res.status, url).toBeLessThan(300);
      const now = await count();
      expect(now, `${method} ${url}`).toBe(audits + 1);
      audits = now;
    }
    // Failures: wrong confirmation, invalid setting value, unknown user.
    await asAdmin()
      .delete(`/api/v1/admin/users/${s.a.user.id}`)
      .send({ confirmEmail: 'otro@x.com' })
      .expect(400);
    await asAdmin()
      .put('/api/v1/admin/settings/registration')
      .send({ value: { open: 'si' } })
      .expect(400);
    await asAdmin()
      .post('/api/v1/admin/users/00000000-0000-4000-8000-000000000000/suspend')
      .expect(404);
    expect(await count()).toBe(audits);
  });

  it('SEC-ADM-06 the admin cannot suspend or delete themselves', async () => {
    const suspend = await asAdmin().post(`/api/v1/admin/users/${admin.id}/suspend`);
    expect(suspend.status).toBeGreaterThanOrEqual(400);
    const remove = await asAdmin()
      .delete(`/api/v1/admin/users/${admin.id}`)
      .send({ confirmEmail: ADMIN_EMAIL });
    expect(remove.status).toBeGreaterThanOrEqual(400);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    // There is no endpoint that changes roles: the role only comes from ADMIN_EMAILS.
    const patch = await asAdmin().patch('/api/v1/users/me').send({ role: 'USER' });
    expect([200, 400]).toContain(patch.status);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe(
      'ADMIN',
    );
  });

  it('SEC-ADM-07 deleting a user needs the exact email and then removes every row of theirs', async () => {
    await asAdmin().delete(`/api/v1/admin/users/${s.b.user.id}`).send({}).expect(400);
    await asAdmin()
      .delete(`/api/v1/admin/users/${s.b.user.id}`)
      .send({ confirmEmail: s.a.user.email })
      .expect(400);
    await asAdmin()
      .delete(`/api/v1/admin/users/${s.b.user.id}`)
      .send({ confirmEmail: `${s.b.user.email}x` })
      .expect(400);

    // A user with everything, deleted: every table goes back to the counts before them
    // (plus one audit entry).
    const before = await tableCounts(ctx);
    const doomed = await seedVictim(ctx.app, ctx.prisma, 'borrar@security.platin');
    await as(ctx.app, doomed.user)
      .post('/api/v1/plan-requests')
      .send({ planId: proPlanId })
      .expect(201);
    await asAdmin()
      .delete(`/api/v1/admin/users/${doomed.user.id}`)
      .send({ confirmEmail: ' BORRAR@security.platin ' })
      .expect(204);
    const after = await tableCounts(ctx);
    const diff = Object.fromEntries(
      Object.keys(after)
        .filter((table) => after[table] !== before[table])
        .map((table) => [table, after[table] - before[table]]),
    );
    // Exchange rates are global (not user data) and may be cached by the seed's USD pocket.
    delete diff['ExchangeRate'];
    expect(diff).toEqual({ AuditLog: 1 });
  });

  it('SEC-ADM-08 the announcement is stored and served as plain text', async () => {
    const text = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    await asAdmin()
      .put('/api/v1/admin/settings/announcement')
      .send({ value: { text, startsOn: null, endsOn: null } })
      .expect(200);
    const res = await as(ctx.app, s.a.user).get('/api/v1/announcements/current').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.announcement.text).toBe(text);
    // Rendering is checked in the web (no innerHTML): see the report, SEC-ADM-08.
  });

  it('SEC-ADM-09 with registration closed, password sign-up is refused', async () => {
    await asAdmin()
      .put('/api/v1/admin/settings/registration')
      .send({ value: { open: false } })
      .expect(200);
    const res = await request(server())
      .post('/api/v1/auth/register')
      .send({ email: 'nueva@security.platin', password: PASSWORD })
      .expect(403);
    expect(res.body.code).toBe('REGISTRATION_CLOSED');
  });

  it('SEC-ADM-10 ADMIN_EMAILS matches exact emails, case-insensitive, nothing similar', async () => {
    const app = await createTestApp({ ...SECURITY_ENV, ADMIN_EMAILS: ' Jose@Gmail.com ,  ' });
    try {
      const sign = (email: string) => registerUser(app.app, { email, password: PASSWORD });
      const role = async (user: TestUser) =>
        (await as(app.app, user).get('/api/v1/users/me').expect(200)).body.role;
      expect(await role(await sign('jose@gmail.com'))).toBe('ADMIN');
      for (const lookalike of [
        'jose@gmail.com.evil.com',
        'xjose@gmail.com',
        'jose+1@gmail.com',
        'jose@gmail.co',
      ]) {
        expect(await role(await sign(lookalike)), lookalike).toBe('USER');
      }
      // An empty entry in the list does not make everyone admin.
      expect(await role(await sign('cualquiera@security.platin'))).toBe('USER');
    } finally {
      await app.app.close();
      process.env.ADMIN_EMAILS = SECURITY_ENV.ADMIN_EMAILS;
    }
  });
});

describe('security: administration with Google sign-up (fake provider)', () => {
  let ctx: TestContext;
  const google = new FakeGoogleProvider();
  const APP = 'https://platin.test';

  beforeAll(async () => {
    ctx = await createTestApp(
      {
        ...SECURITY_ENV,
        PUBLIC_APP_URL: APP,
        OAUTH_COOKIE_SECRET: 'security-oauth-cookie-secret-with-32-chars-or-more',
      },
      { oauthProviders: [google] },
    );
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('SEC-ADM-09 with registration closed, sign-up with Google is refused too', async () => {
    await registerUser(ctx.app, { email: ADMIN_EMAIL, password: PASSWORD });
    const admin = await login(ctx.app, ADMIN_EMAIL);
    await as(ctx.app, admin)
      .put('/api/v1/admin/settings/registration')
      .send({ value: { open: false } })
      .expect(200);

    const start = await request(ctx.app.getHttpServer())
      .get('/api/v1/auth/oauth/google/start')
      .expect(302);
    const state = new URL(start.headers['location']).searchParams.get('state');
    const cookie = ([] as string[])
      .concat(start.headers['set-cookie'])
      .find((c) => c.startsWith('oauth_tx='));
    const code = google.code({ providerUserId: 'g-new', email: 'nuevo@gmail.com' });
    const res = await request(ctx.app.getHttpServer())
      .get(
        `/api/v1/auth/oauth/google/callback?code=${code}&state=${state}&iss=${encodeURIComponent(FAKE_ISSUER)}`,
      )
      .set('Cookie', (cookie ?? '').split(';')[0])
      .expect(302);
    expect(res.headers['location']).toBe(`${APP}/ingresar?error=REGISTRATION_CLOSED`);
    expect(await ctx.prisma.user.count({ where: { email: 'nuevo@gmail.com' } })).toBe(0);
  });
});
