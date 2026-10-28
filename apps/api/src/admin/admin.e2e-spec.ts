import type { AdminUserDetail, AdminUsersPage, AuditPage } from '@platin/contracts';
import request from 'supertest';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

const ADMIN_EMAIL = 'admin@test.platin';
const PASSWORD = 'una-clave-segura';

describe('admin', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let user: TestUser;

  const asAdmin = () => as(ctx.app, admin);
  const server = () => ctx.app.getHttpServer();
  const login = (email: string) =>
    request(server()).post('/api/v1/auth/login').send({ email, password: PASSWORD });

  beforeAll(async () => {
    ctx = await createTestApp({ ADMIN_EMAILS: ` ${ADMIN_EMAIL.toUpperCase()} , otro@test.platin` });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await registerUser(ctx.app, { email: ADMIN_EMAIL, name: 'Admin' });
    user = await registerUser(ctx.app, { email: 'ana@test.platin', name: 'Ana' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function auditActions(): Promise<string[]> {
    const res = await asAdmin().get('/api/v1/admin/audit').expect(200);
    return (res.body as AuditPage).items.map((entry) => entry.action);
  }

  describe('access (ADM-01)', () => {
    it('the emails in ADMIN_EMAILS sign in as ADMIN; everyone else as USER', async () => {
      const me = await asAdmin().get('/api/v1/users/me').expect(200);
      expect(me.body.role).toBe('ADMIN');
      const token = JSON.parse(
        Buffer.from(admin.accessToken.split('.')[1], 'base64url').toString(),
      ) as { role: string };
      expect(token.role).toBe('ADMIN');
      expect((await as(ctx.app, user).get('/api/v1/users/me').expect(200)).body.role).toBe('USER');
    });

    it('a user removed from ADMIN_EMAILS loses the role on the next sign-in', async () => {
      await ctx.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      const res = await login(user.email).expect(200);
      expect(res.body.user.role).toBe('USER');
    });

    it('common users get 403 and anonymous requests 401 on every admin endpoint', async () => {
      const endpoints: [method: 'get' | 'post' | 'put' | 'delete', url: string][] = [
        ['get', '/api/v1/admin/metrics'],
        ['get', '/api/v1/admin/users'],
        ['get', `/api/v1/admin/users/${admin.id}`],
        ['post', `/api/v1/admin/users/${admin.id}/suspend`],
        ['post', `/api/v1/admin/users/${admin.id}/reactivate`],
        ['post', `/api/v1/admin/users/${admin.id}/logout`],
        ['delete', `/api/v1/admin/users/${admin.id}`],
        ['get', '/api/v1/admin/settings/registration'],
        ['put', '/api/v1/admin/settings/registration'],
        ['get', '/api/v1/admin/audit'],
      ];
      for (const [method, url] of endpoints) {
        const res = await as(ctx.app, user)
          [method](url)
          .send({ value: { open: false } });
        expect(res.status, `${method} ${url}`).toBe(403);
        await request(server())[method](url).expect(401);
      }
      expect(await auditActions()).toEqual([]);
    });

    it('checks the role in the database, not only in the token', async () => {
      await ctx.prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
      await asAdmin().get('/api/v1/admin/metrics').expect(403);
    });
  });

  describe('users (ADM-03, ADM-04)', () => {
    it('lists with search, filters and cursor', async () => {
      for (const name of ['Bruno', 'Carla', 'Dario']) {
        await registerUser(ctx.app, { email: `${name.toLowerCase()}@test.platin`, name });
      }
      const first = (await asAdmin().get('/api/v1/admin/users?limit=2').expect(200))
        .body as AdminUsersPage;
      expect(first.items.map((u) => u.email)).toEqual(['dario@test.platin', 'carla@test.platin']);
      const second = (
        await asAdmin().get(`/api/v1/admin/users?limit=2&cursor=${first.nextCursor}`).expect(200)
      ).body as AdminUsersPage;
      expect(second.items.map((u) => u.email)).toEqual(['bruno@test.platin', 'ana@test.platin']);

      const search = await asAdmin().get('/api/v1/admin/users?query=CARL').expect(200);
      expect(search.body.items.map((u: { name: string }) => u.name)).toEqual(['Carla']);
      const admins = await asAdmin().get('/api/v1/admin/users?role=ADMIN').expect(200);
      expect(admins.body.items).toHaveLength(1);
    });

    it('shows how many records of each type the user has', async () => {
      await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '1000' });
      const res = await asAdmin().get(`/api/v1/admin/users/${user.id}`).expect(200);
      const detail = res.body as AdminUserDetail;
      expect(detail).toMatchObject({ email: user.email, role: 'USER', status: 'ACTIVE' });
      expect(detail.counts).toMatchObject({ accounts: 2, pockets: 2, cards: 0, goals: 0 });
      expect(detail.activeSessions).toBe(1);
      await asAdmin().get('/api/v1/admin/users/00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('suspends: closes sessions and blocks sign-in; reactivating lets them back in', async () => {
      const res = await asAdmin().post(`/api/v1/admin/users/${user.id}/suspend`).expect(200);
      expect(res.body).toMatchObject({ status: 'SUSPENDED', activeSessions: 0 });

      const loginRes = await login(user.email).expect(403);
      expect(loginRes.body.code).toBe('ACCOUNT_SUSPENDED');
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);

      await asAdmin().post(`/api/v1/admin/users/${user.id}/reactivate`).expect(200);
      await login(user.email).expect(200);
      // The data is kept.
      expect(await ctx.prisma.account.count({ where: { userId: user.id } })).toBe(1);

      const audit = (await asAdmin().get('/api/v1/admin/audit').expect(200)).body as AuditPage;
      expect(audit.items.map((e) => e.action)).toEqual(['user.reactivate', 'user.suspend']);
      expect(audit.items[1]).toMatchObject({
        actorEmail: ADMIN_EMAIL,
        targetUserId: user.id,
        targetEmail: user.email,
        payload: { before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' } },
      });
    });

    it('the admin cannot suspend or delete their own account', async () => {
      const res = await asAdmin().post(`/api/v1/admin/users/${admin.id}/suspend`).expect(409);
      expect(res.body.code).toBe('ADMIN_SELF_ACTION');
      await asAdmin()
        .delete(`/api/v1/admin/users/${admin.id}`)
        .send({ confirmEmail: ADMIN_EMAIL })
        .expect(409);
      expect(await auditActions()).toEqual([]);
    });

    it('closes every session of a user', async () => {
      await login(user.email).expect(200);
      const res = await asAdmin().post(`/api/v1/admin/users/${user.id}/logout`).expect(200);
      expect(res.body.activeSessions).toBe(0);
      await request(server()).post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
      expect(await auditActions()).toEqual(['user.logout']);
    });

    it('deletes the user with all their data after confirming the email', async () => {
      const pocket = await createPocket(ctx.app, user, { initialBalance: '5000' });
      const food = await category(ctx.app, user, 'Supermercado');
      await as(ctx.app, user)
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: pocket.id,
          categoryId: food.id,
          amount: '100',
          date: '2026-10-23',
        })
        .expect(201);
      await as(ctx.app, user)
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 20, dueDay: 5 })
        .expect(201);
      await as(ctx.app, user)
        .post('/api/v1/goals')
        .send({
          name: 'Viaje',
          targetAmount: '1000',
          currency: 'ARS',
          targetPeriod: '2027-12',
          pocketIds: [pocket.id],
        })
        .expect(201);

      const wrong = await asAdmin()
        .delete(`/api/v1/admin/users/${user.id}`)
        .send({ confirmEmail: 'otra@test.platin' })
        .expect(400);
      expect(wrong.body.code).toBe('CONFIRMATION_MISMATCH');

      await asAdmin()
        .delete(`/api/v1/admin/users/${user.id}`)
        .send({ confirmEmail: user.email.toUpperCase() })
        .expect(204);
      expect(await ctx.prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
      for (const count of [
        ctx.prisma.account.count({ where: { userId: user.id } }),
        ctx.prisma.transaction.count({ where: { userId: user.id } }),
        ctx.prisma.category.count({ where: { userId: user.id } }),
        ctx.prisma.goal.count({ where: { userId: user.id } }),
        ctx.prisma.creditCard.count({ where: { userId: user.id } }),
      ]) {
        expect(await count).toBe(0);
      }
      // The admin's own data is untouched.
      expect(await ctx.prisma.account.count({ where: { userId: admin.id } })).toBe(1);

      const audit = (await asAdmin().get('/api/v1/admin/audit').expect(200)).body as AuditPage;
      expect(audit.items[0]).toMatchObject({
        action: 'user.delete',
        targetUserId: user.id,
        targetEmail: user.email,
      });
    });
  });

  describe('settings (ADM-05)', () => {
    it('closes sign-up, except for the configured admins', async () => {
      await asAdmin()
        .put('/api/v1/admin/settings/registration')
        .send({ value: { open: false } })
        .expect(200);
      const res = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'nuevo@test.platin', password: PASSWORD })
        .expect(403);
      expect(res.body.code).toBe('REGISTRATION_CLOSED');
      await registerUser(ctx.app, { email: 'otro@test.platin' });
      expect(await auditActions()).toEqual(['setting.update']);
    });

    it('validates each value with its schema and rejects unknown keys', async () => {
      const bad = await asAdmin()
        .put('/api/v1/admin/settings/default-rate')
        .send({ value: { rateType: 'CRIPTO' } })
        .expect(400);
      expect(bad.body.errors[0].path).toBe('value.rateType');
      await asAdmin().get('/api/v1/admin/settings/plata').expect(400);
      const defaults = await asAdmin().get('/api/v1/admin/settings/registration').expect(200);
      expect(defaults.body).toEqual({
        key: 'registration',
        value: { open: true },
        updatedAt: null,
      });
    });

    it('new users start with the configured categories and rate type', async () => {
      await asAdmin()
        .put('/api/v1/admin/settings/suggested-categories')
        .send({
          value: {
            categories: [
              { name: 'Comida', kind: 'EXPENSE', icon: 'utensils', color: 'expense' },
              { name: 'Sueldo', kind: 'INCOME', icon: 'briefcase', color: 'brand' },
            ],
          },
        })
        .expect(200);
      await asAdmin()
        .put('/api/v1/admin/settings/default-rate')
        .send({ value: { rateType: 'BLUE' } })
        .expect(200);
      const fresh = await registerUser(ctx.app);
      const categories = await as(ctx.app, fresh).get('/api/v1/categories').expect(200);
      expect(categories.body.map((c: { name: string }) => c.name).sort()).toEqual([
        'Ajustes',
        'Comida',
        'Rendimientos',
        'Sueldo',
      ]);
      const me = await as(ctx.app, fresh).get('/api/v1/users/me').expect(200);
      expect(me.body.valuationRate).toBe('BLUE');
      // Existing users keep theirs.
      expect((await as(ctx.app, user).get('/api/v1/users/me')).body.valuationRate).toBe('MEP');
    });

    it('publishes an announcement every user sees while it is in force', async () => {
      const current = () =>
        as(ctx.app, user)
          .get('/api/v1/announcements/current')
          .expect(200)
          .then((res) => res.body.announcement);
      expect(await current()).toBeNull();
      await asAdmin()
        .put('/api/v1/admin/settings/announcement')
        .send({ value: { text: 'Mantenimiento el sábado', startsOn: null, endsOn: '2099-01-01' } })
        .expect(200);
      expect(await current()).toEqual({ text: 'Mantenimiento el sábado', endsOn: '2099-01-01' });
      await asAdmin()
        .put('/api/v1/admin/settings/announcement')
        .send({ value: { text: 'Viejo', startsOn: null, endsOn: '2000-01-01' } })
        .expect(200);
      expect(await current()).toBeNull();
    });
  });

  describe('metrics and activity (ADM-02)', () => {
    it('counts users, activity and feature usage', async () => {
      await createPocket(ctx.app, user, { kind: 'SAVINGS', currency: 'USD' });
      await as(ctx.app, user).get('/api/v1/users/me').expect(200);
      await asAdmin().get('/api/v1/users/me').expect(200);
      await expect.poll(() => ctx.prisma.activityDay.count()).toBe(2);
      expect(
        (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastSeenAt,
      ).not.toBeNull();

      const res = await asAdmin().get('/api/v1/admin/metrics').expect(200);
      expect(res.body).toMatchObject({
        totalUsers: 2,
        suspendedUsers: 0,
        activeLast7Days: 2,
        activeLast30Days: 2,
        featureUsage: { cards: 0, goals: 0, savingsPockets: 1, investments: 0 },
      });
      expect(res.body.signupsByWeek).toHaveLength(12);
      expect(res.body.signupsByWeek.at(-1).count).toBe(2);
    });
  });

  describe('privacy', () => {
    it('no admin response contains amounts, balances, descriptions or account names', async () => {
      const pocket = await createPocket(ctx.app, user, {
        accountName: 'CuentaSecretaXYZ',
        initialBalance: '98765.43',
      });
      const food = await category(ctx.app, user, 'Supermercado');
      await as(ctx.app, user)
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: pocket.id,
          categoryId: food.id,
          amount: '12345.67',
          date: '2026-10-23',
          description: 'DescripcionSecreta',
        })
        .expect(201);
      await asAdmin().post(`/api/v1/admin/users/${user.id}/logout`).expect(200);
      await asAdmin()
        .put('/api/v1/admin/settings/announcement')
        .send({ value: { text: 'Hola', startsOn: null, endsOn: null } })
        .expect(200);

      const bodies: unknown[] = [];
      for (const url of [
        '/api/v1/admin/metrics',
        '/api/v1/admin/users',
        `/api/v1/admin/users/${user.id}`,
        '/api/v1/admin/audit',
        '/api/v1/admin/settings/registration',
        '/api/v1/admin/settings/announcement',
        '/api/v1/admin/settings/default-rate',
      ]) {
        bodies.push((await asAdmin().get(url).expect(200)).body);
      }
      const json = JSON.stringify(bodies);
      for (const secret of [
        'CuentaSecretaXYZ',
        'DescripcionSecreta',
        '98765',
        '12345',
        'Supermercado',
      ]) {
        expect(json, secret).not.toContain(secret);
      }
      const keys = [...json.matchAll(/"([^"]+)":/g)].map((match) => match[1]);
      expect(keys.filter((key) => /amount|balance|description|currency/i.test(key))).toEqual([]);
    });
  });
});
