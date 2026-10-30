import { as, registerUser, TestUser } from '../auth-helpers';
import { addPocket, category, createAccount } from '../fixtures';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { ADMIN_EMAIL, login, PASSWORD, SECURITY_ENV } from './seed';

/** One of each (two accounts: sign-up already creates "Efectivo"). */
const LIMIT_ONE = {
  maxAccounts: 2,
  maxPockets: 1,
  maxCards: 1,
  maxGoals: 1,
  maxFixed: 1,
  investments: false,
};

describe('security: plans and limits', () => {
  let ctx: TestContext;
  let user: TestUser;
  let admin: TestUser;
  let freeId: string;
  let proId: string;
  let otherExpenses: string;

  const api = () => as(ctx.app, user);
  const card = (name: string) =>
    api().post('/api/v1/cards').send({ name, closingDay: 30, dueDay: 5 });
  const goal = (name: string, pocketIds: string[] = []) =>
    api()
      .post('/api/v1/goals')
      .send({ name, targetAmount: '1000', currency: 'ARS', targetPeriod: '2027-12', pocketIds });
  const fixed = (name: string, pocketId: string) =>
    api().post('/api/v1/fixed').send({
      kind: 'EXPENSE',
      name,
      categoryId: otherExpenses,
      pocketId,
      amount: '100',
      dayOfMonth: 1,
      startPeriod: '2026-11',
    });
  const expectLimit = (res: { status: number; body: { code?: string } }, label: string) => {
    expect(res.status, label).toBe(403);
    expect(res.body.code, label).toBe('PLAN_LIMIT_REACHED');
  };

  beforeAll(async () => {
    ctx = await createTestApp(SECURITY_ENV);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    freeId = (await ctx.prisma.plan.update({ where: { key: 'free' }, data: { limits: LIMIT_ONE } }))
      .id;
    proId = (await ctx.prisma.plan.findUniqueOrThrow({ where: { key: 'pro' } })).id;
    await registerUser(ctx.app, { email: ADMIN_EMAIL, password: PASSWORD });
    admin = await login(ctx.app, ADMIN_EMAIL);
    user = await registerUser(ctx.app, { password: PASSWORD });
    otherExpenses = (await category(ctx.app, user, 'Otros gastos')).id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('SEC-PLAN-01 at the limit, creating another account, pocket, card, goal or fixed item is refused', async () => {
    const account = await createAccount(ctx.app, user);
    expectLimit(
      await api().post('/api/v1/accounts').send({ name: 'Otra', kind: 'WALLET' }),
      'accounts',
    );

    await addPocket(ctx.app, user, account.id, { name: 'Ahorro' });
    expectLimit(
      await api()
        .post(`/api/v1/accounts/${account.id}/pockets`)
        .send({ name: 'Ahorro 2', kind: 'SAVINGS', currency: 'ARS' }),
      'pockets',
    );

    await card('Visa').expect(201);
    expectLimit(await card('Master'), 'cards');

    await goal('Auto').expect(201);
    expectLimit(await goal('Casa'), 'goals');

    expect((await fixed('Luz', account.pockets[0].id)).status).toBe(201);
    expectLimit(await fixed('Gas', account.pockets[0].id), 'fixed');
  });

  // Was finding SEC-F06: the limit was read and the row inserted in separate statements, with
  // no lock, so parallel requests at the limit all passed the check (12 cards with a limit of 3).
  it('SEC-PLAN-02 ten parallel creations one below the limit create exactly one [SEC-F06]', async () => {
    await ctx.prisma.plan.update({
      where: { id: freeId },
      data: { limits: { ...LIMIT_ONE, maxCards: 3 } },
    });
    await card('Visa 1').expect(201);
    await card('Visa 2').expect(201);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => card(`Carrera ${i}`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 403)).toHaveLength(9);
    expect(
      await ctx.prisma.creditCard.count({ where: { userId: user.id, archivedAt: null } }),
    ).toBe(3);
  });

  it('SEC-PLAN-03 creating an account only brings its "Disponible", which does not count', async () => {
    const account = await createAccount(ctx.app, user);
    expect(account.pockets).toHaveLength(1);
    const usage = (await api().get('/api/v1/me/plan').expect(200)).body;
    expect(JSON.stringify(usage)).toContain('"pockets"');
    expect(
      await ctx.prisma.pocket.count({ where: { userId: user.id, kind: { not: 'AVAILABLE' } } }),
    ).toBe(0);
  });

  // Was finding SEC-F05: restoring what is archived, paused or finished went over the limit,
  // because limits were only checked on POST.
  it('SEC-PLAN-03 restoring an archived account, pocket or card, or resuming a fixed item, respects the limit [SEC-F05]', async () => {
    const first = await createAccount(ctx.app, user, { name: 'Primera' });
    await api().patch(`/api/v1/accounts/${first.id}`).send({ archived: true }).expect(200);
    const second = await createAccount(ctx.app, user, { name: 'Segunda' });
    expectLimit(
      await api().patch(`/api/v1/accounts/${first.id}`).send({ archived: false }),
      'restore account',
    );

    const savings = await addPocket(ctx.app, user, second.id, { name: 'A' });
    await api().patch(`/api/v1/pockets/${savings.id}`).send({ archived: true }).expect(200);
    await addPocket(ctx.app, user, second.id, { name: 'B' });
    expectLimit(
      await api().patch(`/api/v1/pockets/${savings.id}`).send({ archived: false }),
      'restore pocket',
    );

    const visa = (await card('Visa').expect(201)).body;
    await api().patch(`/api/v1/cards/${visa.id}`).send({ archived: true }).expect(200);
    await card('Master').expect(201);
    expectLimit(
      await api().patch(`/api/v1/cards/${visa.id}`).send({ archived: false }),
      'restore card',
    );

    const luz = (await fixed('Luz', second.pockets[0].id)).body;
    await api().patch(`/api/v1/fixed/${luz.id}`).send({ paused: true }).expect(200);
    expect((await fixed('Gas', second.pockets[0].id)).status).toBe(201);
    expectLimit(
      await api().patch(`/api/v1/fixed/${luz.id}`).send({ paused: false }),
      'resume fixed',
    );
  });

  it('SEC-PLAN-03 reactivating a goal, or restoring an account with its pockets, respects the limit [SEC-F05]', async () => {
    const auto = (await goal('Auto').expect(201)).body;
    await api().patch(`/api/v1/goals/${auto.id}`).send({ status: 'CANCELLED' }).expect(200);
    await goal('Casa').expect(201);
    expectLimit(
      await api().patch(`/api/v1/goals/${auto.id}`).send({ status: 'ACTIVE' }),
      'reactivate goal',
    );

    // Room for the account, but not for the pocket it brings back.
    const bank = await createAccount(ctx.app, user, { name: 'Banco' });
    await addPocket(ctx.app, user, bank.id, { name: 'Ahorro' });
    await api().patch(`/api/v1/accounts/${bank.id}`).send({ archived: true }).expect(200);
    // The pocket slot is now taken by a pocket in the sign-up 'Efectivo' account.
    const cash = (await api().get('/api/v1/accounts').expect(200)).body.items[0];
    await addPocket(ctx.app, user, cash.id, { name: 'Ahorro 2' });
    const restore = await api().patch(`/api/v1/accounts/${bank.id}`).send({ archived: false });
    expectLimit(restore, 'restore account with pockets');
    expect(restore.body.resource).toBe('pockets');
    // Nothing half-restored: the account and its pocket are still archived.
    const row = await ctx.prisma.account.findUniqueOrThrow({
      where: { id: bank.id },
      include: { pockets: true },
    });
    expect(row.archivedAt).not.toBeNull();
    expect(row.pockets.every((p) => p.archivedAt)).toBe(true);
  });

  it('SEC-PLAN-03 under the limit, restoring and resuming still work', async () => {
    await ctx.prisma.plan.update({
      where: { id: freeId },
      data: { limits: { ...LIMIT_ONE, maxCards: 2, maxFixed: 2 } },
    });
    const visa = (await card('Visa').expect(201)).body;
    await api().patch(`/api/v1/cards/${visa.id}`).send({ archived: true }).expect(200);
    await card('Master').expect(201);
    await api().patch(`/api/v1/cards/${visa.id}`).send({ archived: false }).expect(200);
    const account = await createAccount(ctx.app, user);
    const luz = (await fixed('Luz', account.pockets[0].id)).body;
    await api().patch(`/api/v1/fixed/${luz.id}`).send({ paused: true }).expect(200);
    await api().patch(`/api/v1/fixed/${luz.id}`).send({ paused: false }).expect(200);
  });

  it('SEC-PLAN-04 without investments, the overview, valuations and new investment pockets are refused', async () => {
    const account = await createAccount(ctx.app, user);
    const refused = [
      await api().get('/api/v1/investments'),
      await api()
        .post('/api/v1/investments/valuations')
        .send({ items: [{ pocketId: account.pockets[0].id, date: '2026-10-20', value: '1' }] }),
      await api()
        .post(`/api/v1/accounts/${account.id}/pockets`)
        .send({ name: 'CEDEARs', kind: 'INVESTMENT', currency: 'ARS', instrument: 'CEDEAR' }),
    ];
    for (const [i, res] of refused.entries()) {
      expect(res.status, `request ${i}`).toBe(403);
      expect(res.body.code, `request ${i}`).toBe('FEATURE_NOT_IN_PLAN');
    }
    // Allowed on purpose (ADR 0015): viewing the history and deleting a valuation of existing data.
  });

  // Was finding SEC-F07: turning a savings pocket into an investment one with PATCH skipped
  // the feature check that POST does.
  it('SEC-PLAN-04 a pocket cannot become an investment through PATCH without the feature [SEC-F07]', async () => {
    await ctx.prisma.plan.update({
      where: { id: freeId },
      data: { limits: { ...LIMIT_ONE, maxPockets: 5 } },
    });
    const account = await createAccount(ctx.app, user);
    const savings = await addPocket(ctx.app, user, account.id, { name: 'Ahorro' });
    const res = await api()
      .patch(`/api/v1/pockets/${savings.id}`)
      .send({ kind: 'INVESTMENT', instrument: 'CEDEAR' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
  });

  it('SEC-PLAN-05 a user cannot change their own plan', async () => {
    await api().patch('/api/v1/users/me').send({ planId: proId }).expect(200);
    const request = (await api().post('/api/v1/plan-requests').send({ planId: proId }).expect(201))
      .body;
    for (const url of [
      `/api/v1/admin/plan-requests/${request.id}/approve`,
      `/api/v1/admin/users/${user.id}/plan`,
    ]) {
      expect((await api().post(url).send({ planId: proId })).status).toBe(403);
    }
    expect(JSON.stringify((await api().get('/api/v1/me/plan').expect(200)).body)).toContain(
      'Gratis',
    );
    expect(await ctx.prisma.userPlan.count({ where: { userId: user.id, planId: proId } })).toBe(0);
  });

  it('SEC-PLAN-06 when an assigned plan expires the user goes back to the default plan and keeps the data', async () => {
    await as(ctx.app, admin)
      .post(`/api/v1/admin/users/${user.id}/plan`)
      .send({ planId: proId, lastDay: '2099-12-31' })
      .expect(200);
    const account = await createAccount(ctx.app, user);
    await createAccount(ctx.app, user);
    await createAccount(ctx.app, user);

    // Expiry compares instants against the real clock: move the end into the past.
    await ctx.prisma.userPlan.updateMany({
      where: { userId: user.id, planId: proId },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const plan = (await api().get('/api/v1/me/plan').expect(200)).body;
    expect(JSON.stringify(plan)).toContain('Gratis');
    // Nothing is deleted: "Efectivo" and the three accounts are still there and editable.
    expect((await api().get('/api/v1/accounts').expect(200)).body.items).toHaveLength(4);
    await api().patch(`/api/v1/accounts/${account.id}`).send({ name: 'Renombrada' }).expect(200);
    expectLimit(
      await api().post('/api/v1/accounts').send({ name: 'Cuarta', kind: 'WALLET' }),
      'expired',
    );
  });
});
