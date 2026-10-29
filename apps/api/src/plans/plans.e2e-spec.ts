import type { AdminPlan, AdminPlanRequest, MyPlan, PublicPlan } from '@platin/contracts';
import request from 'supertest';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, category, createAccount, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

const ADMIN_EMAIL = 'admin@test.platin';
const FREE_LIMITS = {
  maxAccounts: 2,
  maxPockets: 1,
  maxCards: 1,
  maxGoals: 1,
  maxFixed: 1,
  investments: false,
};

describe('plans', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let user: TestUser;
  let free: AdminPlan;
  let pro: AdminPlan;

  const api = () => as(ctx.app, user);
  const asAdmin = () => as(ctx.app, admin);
  const myPlan = async () => (await api().get('/api/v1/me/plan').expect(200)).body as MyPlan;
  const card = (name = 'Visa') =>
    api().post('/api/v1/cards').send({ name, closingDay: 20, dueDay: 5 });

  beforeAll(async () => {
    ctx = await createTestApp({ ADMIN_EMAILS: ADMIN_EMAIL, CLOCK_TODAY: '2026-10-28' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = await registerUser(ctx.app, { email: ADMIN_EMAIL });
    const plans = (await asAdmin().get('/api/v1/admin/plans').expect(200)).body as AdminPlan[];
    free = plans.find((plan) => plan.key === 'free') as AdminPlan;
    pro = plans.find((plan) => plan.key === 'pro') as AdminPlan;
    await asAdmin()
      .patch(`/api/v1/admin/plans/${free.id}`)
      .send({ limits: FREE_LIMITS, priceArs: null })
      .expect(200);
    await asAdmin().patch(`/api/v1/admin/plans/${pro.id}`).send({ priceArs: '4500' }).expect(200);
    user = await registerUser(ctx.app, { email: 'ana@test.platin' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function expectLimit(res: request.Response, resource: string, limit: number, used: number) {
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'PLAN_LIMIT_REACHED', resource, limit, used });
  }

  it('a new user starts on the default plan (PLN-02) and sees their usage (PLN-03)', async () => {
    const plan = await myPlan();
    expect(plan).toMatchObject({
      plan: { key: 'free', name: 'Gratis', limits: FREE_LIMITS },
      source: 'DEFAULT',
      endsAt: null,
      usage: { accounts: 1, pockets: 0, cards: 0, goals: 0, fixed: 0 },
      pendingRequest: null,
    });
    const row = await ctx.prisma.userPlan.findFirstOrThrow({ where: { userId: user.id } });
    expect(row).toMatchObject({ planId: free.id, source: 'DEFAULT' });
  });

  it('the public plans page needs no sign-in and hides private and archived plans', async () => {
    await asAdmin()
      .post('/api/v1/admin/plans')
      .send({ key: 'interno', name: 'Interno', limits: FREE_LIMITS, isPublic: false })
      .expect(201);
    const res = await request(ctx.app.getHttpServer()).get('/api/v1/plans').expect(200);
    const plans = res.body as PublicPlan[];
    expect(plans.map((plan) => plan.key)).toEqual(['free', 'pro']);
    expect(plans[1]).toMatchObject({ priceArs: '4500.00', isDefault: false });
  });

  describe('limits (PLN-04)', () => {
    it('accounts: at the limit it cannot create; archived ones do not count', async () => {
      const second = await createAccount(ctx.app, user, { name: 'Galicia' });
      await expectLimit(
        await api()
          .post('/api/v1/accounts')
          .send({ name: 'BBVA', kind: 'BANK', initialBalance: '0' }),
        'accounts',
        2,
        2,
      );
      await api().patch(`/api/v1/accounts/${second.id}`).send({ archived: true }).expect(200);
      await createAccount(ctx.app, user, { name: 'BBVA' });
    });

    it('pockets: the "Disponible" of each account is free, added pockets count', async () => {
      const account = await createAccount(ctx.app, user, { name: 'Galicia' });
      await addPocket(ctx.app, user, account.id, { name: 'Ahorro' });
      await expectLimit(
        await api()
          .post(`/api/v1/accounts/${account.id}/pockets`)
          .send({ name: 'Viaje', kind: 'SAVINGS', currency: 'ARS', initialBalance: '0' }),
        'pockets',
        1,
        1,
      );
    });

    it('cards, goals and fixed items', async () => {
      await card().expect(201);
      await expectLimit(await card('Master'), 'cards', 1, 1);

      const pocket = await createPocket(ctx.app, user, { name: 'Galicia' });
      const goal = {
        name: 'Viaje',
        targetAmount: '1000',
        currency: 'ARS',
        targetPeriod: '2027-12',
        pocketIds: [pocket.id],
      };
      await api().post('/api/v1/goals').send(goal).expect(201);
      await expectLimit(await api().post('/api/v1/goals').send(goal), 'goals', 1, 1);

      const rent = await category(ctx.app, user, 'Alquiler');
      const fixed = {
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: rent.id,
        pocketId: pocket.id,
        amount: '380000',
        dayOfMonth: 10,
        startPeriod: '2026-10',
      };
      await api().post('/api/v1/fixed').send(fixed).expect(201);
      await expectLimit(await api().post('/api/v1/fixed').send(fixed), 'fixed', 1, 1);

      expect((await myPlan()).usage).toEqual({
        accounts: 2,
        pockets: 0,
        cards: 1,
        goals: 1,
        fixed: 1,
      });
    });

    it('a feature outside the plan answers FEATURE_NOT_IN_PLAN', async () => {
      const res = await api().get('/api/v1/investments').expect(403);
      expect(res.body).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', resource: 'investments' });
      const account = await createAccount(ctx.app, user, { name: 'Broker' });
      const pocket = await api()
        .post(`/api/v1/accounts/${account.id}/pockets`)
        .send({
          name: 'CEDEARs',
          kind: 'INVESTMENT',
          instrument: 'CEDEAR',
          currency: 'USD',
          initialBalance: '0',
        })
        .expect(403);
      expect(pocket.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });
  });

  it('moving to a smaller plan keeps everything: it can be edited but not grown (PLN-05)', async () => {
    await asAdmin()
      .post(`/api/v1/admin/users/${user.id}/plan`)
      .send({ planId: pro.id })
      .expect(200);
    const visa = (await card('Visa').expect(201)).body as { id: string };
    await card('Master').expect(201);
    await card('Amex').expect(201);

    const back = await asAdmin()
      .post(`/api/v1/admin/users/${user.id}/plan`)
      .send({ planId: free.id })
      .expect(200);
    expect(back.body.plan).toMatchObject({ name: 'Gratis', source: 'ADMIN' });

    expect((await api().get('/api/v1/cards').expect(200)).body).toHaveLength(3);
    await api().patch(`/api/v1/cards/${visa.id}`).send({ name: 'Visa Galicia' }).expect(200);
    await expectLimit(await card('Otra'), 'cards', 1, 3);
  });

  it('a plan with a last day ends after that day and the user goes back to the default (PLN-06)', async () => {
    const res = await asAdmin()
      .post(`/api/v1/admin/users/${user.id}/plan`)
      .send({ planId: pro.id, lastDay: '2026-11-27' })
      .expect(200);
    // Inclusive in Buenos Aires: it applies until 2026-11-28 00:00 there.
    expect(res.body.plan).toMatchObject({ name: 'Pro', endsAt: '2026-11-28T03:00:00.000Z' });
    await card('Visa').expect(201);
    await card('Master').expect(201);
    expect((await myPlan()).plan.key).toBe('pro');

    // Thirty days later the assignment has expired.
    await ctx.prisma.userPlan.updateMany({
      where: { userId: user.id, planId: pro.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const plan = await myPlan();
    expect(plan).toMatchObject({ plan: { key: 'free' }, source: 'DEFAULT', endsAt: null });
    expect(plan.usage.cards).toBe(2);
    expect((await api().get('/api/v1/cards').expect(200)).body).toHaveLength(2);

    await asAdmin()
      .post(`/api/v1/admin/users/${user.id}/plan`)
      .send({ planId: pro.id, lastDay: '2026-10-01' })
      .expect(400);
  });

  it('request flow: ask for Pro at the limit, the admin approves, then it can create', async () => {
    await createAccount(ctx.app, user, { name: 'Galicia' });
    const blocked = await api()
      .post('/api/v1/accounts')
      .send({ name: 'BBVA', kind: 'BANK', initialBalance: '0' });
    expect(blocked.status).toBe(403);

    const created = await api()
      .post('/api/v1/plan-requests')
      .send({ planId: pro.id, message: 'Tengo tres bancos' })
      .expect(201);
    expect(created.body).toMatchObject({ planName: 'Pro', status: 'PENDING' });
    const again = await api().post('/api/v1/plan-requests').send({ planId: pro.id }).expect(409);
    expect(again.body.code).toBe('PLAN_REQUEST_PENDING');
    expect((await myPlan()).pendingRequest).toMatchObject({ planName: 'Pro' });
    await api().get('/api/v1/admin/plan-requests').expect(403);

    const pending = (await asAdmin().get('/api/v1/admin/plan-requests?status=PENDING').expect(200))
      .body as AdminPlanRequest[];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      userEmail: user.email,
      currentPlanName: 'Gratis',
      message: 'Tengo tres bancos',
    });

    const approved = await asAdmin()
      .post(`/api/v1/admin/plan-requests/${pending[0].id}/approve`)
      .expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', currentPlanName: 'Pro' });
    await asAdmin().post(`/api/v1/admin/plan-requests/${pending[0].id}/reject`).expect(409);

    expect(await myPlan()).toMatchObject({
      plan: { key: 'pro' },
      source: 'REQUEST',
      pendingRequest: null,
    });
    await createAccount(ctx.app, user, { name: 'BBVA' });
    await api().post('/api/v1/plan-requests').send({ planId: pro.id }).expect(409);

    const audit = await asAdmin().get('/api/v1/admin/audit').expect(200);
    expect(audit.body.items[0]).toMatchObject({
      action: 'plan-request.approve',
      targetEmail: user.email,
    });
  });

  it('a rejected request leaves the plan as it was', async () => {
    const created = await api().post('/api/v1/plan-requests').send({ planId: pro.id }).expect(201);
    await asAdmin().post(`/api/v1/admin/plan-requests/${created.body.id}/reject`).expect(200);
    expect(await myPlan()).toMatchObject({ plan: { key: 'free' }, pendingRequest: null });
  });

  describe('admin plans (PLN-01, PLN-02)', () => {
    it('creates plans, changes the default and never archives it', async () => {
      const family = await asAdmin()
        .post('/api/v1/admin/plans')
        .send({ key: 'familia', name: 'Familia', limits: { ...FREE_LIMITS, maxAccounts: 10 } })
        .expect(201);
      await asAdmin()
        .post('/api/v1/admin/plans')
        .send({ key: 'familia', name: 'Otro', limits: FREE_LIMITS })
        .expect(409);
      await asAdmin()
        .patch(`/api/v1/admin/plans/${family.body.id}`)
        .send({ isDefault: true })
        .expect(200);

      const plans = (await asAdmin().get('/api/v1/admin/plans').expect(200)).body as AdminPlan[];
      expect(plans.filter((plan) => plan.isDefault).map((plan) => plan.key)).toEqual(['familia']);
      const archive = await asAdmin()
        .patch(`/api/v1/admin/plans/${family.body.id}`)
        .send({ archived: true })
        .expect(409);
      expect(archive.body.code).toBe('PLAN_IS_DEFAULT');

      // New users get the new default; existing ones keep theirs.
      const fresh = await registerUser(ctx.app);
      expect((await as(ctx.app, fresh).get('/api/v1/me/plan').expect(200)).body.plan.key).toBe(
        'familia',
      );
      expect((await myPlan()).plan.key).toBe('free');

      const actions = (await asAdmin().get('/api/v1/admin/audit').expect(200)).body.items.map(
        (entry: { action: string }) => entry.action,
      );
      expect(actions.slice(0, 2)).toEqual(['plan.update', 'plan.create']);
    });

    it('counts users per plan in the metrics and filters the user list by plan', async () => {
      await asAdmin()
        .post(`/api/v1/admin/users/${user.id}/plan`)
        .send({ planId: pro.id })
        .expect(200);
      const metrics = await asAdmin().get('/api/v1/admin/metrics').expect(200);
      expect(metrics.body.usersByPlan).toEqual([
        { planId: free.id, name: 'Gratis', count: 1 },
        { planId: pro.id, name: 'Pro', count: 1 },
      ]);
      const list = await asAdmin().get(`/api/v1/admin/users?planId=${pro.id}`).expect(200);
      expect(list.body.items.map((u: { email: string }) => u.email)).toEqual([user.email]);
    });

    it('common users cannot manage plans', async () => {
      await api().get('/api/v1/admin/plans').expect(403);
      await api().patch(`/api/v1/admin/plans/${pro.id}`).send({ name: 'X' }).expect(403);
      await api().post(`/api/v1/admin/users/${user.id}/plan`).send({ planId: pro.id }).expect(403);
    });
  });
});
