import type { AdminMetrics, Dashboard, Onboarding, StatementSummary } from '@platin/contracts';
import request from 'supertest';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext, UNLIMITED } from '../../test/test-app';

const ADMIN_EMAIL = 'admin@test.platin';
const PASSWORD = 'una-clave-segura';

describe('onboarding (AUTH-05, AUTH-11)', () => {
  let ctx: TestContext;
  let user: TestUser;

  const api = (who: TestUser = user) => as(ctx.app, who);
  const state = async (who: TestUser = user) =>
    (await api(who).get('/api/v1/onboarding').expect(200)).body as Onboarding;
  const mark = async (step: string, status: string, who: TestUser = user) =>
    (await api(who).patch(`/api/v1/onboarding/steps/${step}`).send({ status }).expect(200))
      .body as Onboarding;

  beforeAll(async () => {
    // The example of the rule "Onboarding" happens on 8/11.
    ctx = await createTestApp({ ADMIN_EMAILS: ADMIN_EMAIL, CLOCK_TODAY: '2026-11-08' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app, { email: 'ana@test.platin', name: 'Ana' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('a new account starts it from step 1, without "Efectivo" (ADR 0035)', async () => {
    expect(await state()).toEqual({
      status: 'IN_PROGRESS',
      steps: { accounts: 'PENDING', cards: 'PENDING', cardCharges: 'PENDING', fixed: 'PENDING' },
      dismissedAt: null,
      progress: 0,
      missing: ['accounts', 'cards', 'cardCharges', 'fixed'],
      limits: {
        accounts: { max: null, used: 0 },
        cards: { max: null, used: 0 },
        fixed: { max: null, used: 0 },
      },
    });
    const accounts = await api().get('/api/v1/accounts').expect(200);
    expect(accounts.body.items).toEqual([]);
    // The suggested categories are still created when registering.
    await category(ctx.app, user, 'Sueldo');
  });

  it('the whole journey: the example of the rule gives $ 80.780 and $ 3.512 per day', async () => {
    await createAccount(ctx.app, user, { name: 'Efectivo', kind: 'CASH', initialBalance: '0' });
    const mp = await createAccount(ctx.app, user, {
      name: 'Mercado Pago',
      initialBalance: '459880',
    });
    const santander = await createAccount(ctx.app, user, {
      name: 'Santander',
      kind: 'BANK',
      initialBalance: '900',
    });
    expect((await mark('accounts', 'DONE')).progress).toBe(1);

    const card = await api()
      .post('/api/v1/cards')
      .send({
        name: 'Visa Santander',
        closingDay: 26,
        dueDay: 5,
        defaultPaymentPocketId: santander.pockets[0].id,
      })
      .expect(201);
    await mark('cards', 'DONE');
    await mark('cardCharges', 'DONE');

    const salary = await category(ctx.app, user, 'Sueldo');
    const rent = await category(ctx.app, user, 'Alquiler');
    const subscriptions = await category(ctx.app, user, 'Suscripciones');
    const fixed = (body: object) => api().post('/api/v1/fixed').send(body).expect(201);
    // The web sends next month for a day that already passed (fixedStartPeriod).
    await fixed({
      kind: 'INCOME',
      name: 'Sueldo',
      categoryId: salary.id,
      pocketId: mp.pockets[0].id,
      amount: '1600000',
      dayOfMonth: 1,
      startPeriod: '2026-12',
    });
    await fixed({
      kind: 'EXPENSE',
      name: 'Alquiler',
      categoryId: rent.id,
      pocketId: mp.pockets[0].id,
      amount: '380000',
      dayOfMonth: 10,
      startPeriod: '2026-11',
    });
    await fixed({
      kind: 'EXPENSE',
      name: 'Spotify',
      categoryId: subscriptions.id,
      cardId: card.body.id,
      currency: 'ARS',
      amount: '3300',
      dayOfMonth: 7,
      startPeriod: '2026-12',
    });
    const done = await mark('fixed', 'DONE');
    expect(done).toMatchObject({ status: 'DONE', progress: 4, missing: [] });

    await api().post('/api/v1/sync').expect(200);
    const dashboard = (await api().get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(dashboard).toMatchObject({
      inAccounts: '460780.00',
      toPay: '380000.00',
      free: '80780.00',
      perDay: '3512.00',
    });
  });

  it('"Todavía no lo cobré": a salary that starts this month leaves its pending to confirm', async () => {
    const mp = await createAccount(ctx.app, user, { name: 'Mercado Pago' });
    const salary = await category(ctx.app, user, 'Sueldo');
    await api()
      .post('/api/v1/fixed')
      .send({
        kind: 'INCOME',
        name: 'Sueldo',
        categoryId: salary.id,
        pocketId: mp.pockets[0].id,
        amount: '1600000',
        dayOfMonth: 1,
        startPeriod: '2026-11',
      })
      .expect(201);
    await api().post('/api/v1/sync').expect(200);
    const pending = await ctx.prisma.transaction.findMany({
      where: { userId: user.id, status: 'PENDING' },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].amount.toString()).toBe('1600000');
  });

  it('the current charges land in their statement', async () => {
    const santander = await createAccount(ctx.app, user, { name: 'Santander', kind: 'BANK' });
    const card = await api()
      .post('/api/v1/cards')
      .send({
        name: 'Visa',
        closingDay: 26,
        dueDay: 5,
        defaultPaymentPocketId: santander.pockets[0].id,
      })
      .expect(201);
    const cardId = card.body.id as string;
    await mark('cards', 'DONE');
    const other = await category(ctx.app, user, 'Otros gastos');
    const charge = (body: object) =>
      api()
        .post(`/api/v1/cards/${cardId}/charges`)
        .send({ date: '2026-11-08', categoryId: other.id, currency: 'ARS', ...body })
        .expect(201);
    await charge({
      description: 'Zapatillas',
      installmentAmount: '31111',
      installmentsCount: 9,
      startInstallment: 6,
    });
    await charge({ description: 'Compras anteriores', totalAmount: '85000' });
    await mark('cardCharges', 'DONE');

    const statements = await api().get(`/api/v1/cards/${cardId}/statements`).expect(200);
    const open = (statements.body as StatementSummary[]).find((s) => s.status === 'OPEN');
    // Installment 6 of 9 plus the previous purchases, in the open statement (closes 26/11).
    expect(open).toMatchObject({ period: '2026-11', totals: { ARS: '116111.00' } });
  });

  it('every step can be skipped; skipping the cards skips their charges', async () => {
    await mark('accounts', 'SKIPPED');
    const afterCards = await mark('cards', 'SKIPPED');
    expect(afterCards.steps.cardCharges).toBe('SKIPPED');
    const done = await mark('fixed', 'SKIPPED');
    expect(done).toMatchObject({ status: 'DONE', progress: 4, missing: [] });
    expect((await api().get('/api/v1/accounts').expect(200)).body.items).toEqual([]);
  });

  it('charges "más tarde" stay missing, and "Ahora no" lasts until the next sign-in', async () => {
    await mark('accounts', 'DONE');
    await mark('cards', 'DONE');
    const later = await mark('cardCharges', 'LATER');
    expect(later).toMatchObject({
      status: 'IN_PROGRESS',
      progress: 2,
      missing: ['cardCharges', 'fixed'],
    });

    const dismissed = (await api().post('/api/v1/onboarding/dismiss').expect(200))
      .body as Onboarding;
    expect(dismissed.dismissedAt).not.toBeNull();
    // A refresh is not a new sign-in.
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', user.cookie)
      .expect(200);
    expect((await state()).dismissedAt).not.toBeNull();

    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    expect(await state()).toMatchObject({ dismissedAt: null, progress: 2 });
  });

  it('other preferences can change without losing the state', async () => {
    await mark('accounts', 'DONE');
    await api()
      .patch('/api/v1/users/me')
      .send({ preferences: { homeShortcuts: ['cards'] } })
      .expect(200);
    expect((await state()).steps.accounts).toBe('DONE');
    // The state is not a preference the user can write.
    await api()
      .patch('/api/v1/users/me')
      .send({ preferences: { onboarding: { status: 'DONE' } } })
      .expect(400);
  });

  it('an account from before iteration 13 never sees it', async () => {
    await ctx.prisma.user.update({ where: { id: user.id }, data: { preferences: {} } });
    expect(await state()).toMatchObject({ status: 'DONE', progress: 4, missing: [] });
    // Marking or dismissing doesn't reopen it.
    expect((await mark('fixed', 'LATER')).status).toBe('DONE');
    const dismissed = (await api().post('/api/v1/onboarding/dismiss').expect(200))
      .body as Onboarding;
    expect(dismissed).toMatchObject({ status: 'DONE', dismissedAt: null });
  });

  it('starting over (AUTH-09) opens it again from step 1', async () => {
    await mark('accounts', 'DONE');
    await mark('cards', 'SKIPPED');
    await mark('fixed', 'DONE');
    expect((await state()).status).toBe('DONE');
    await api()
      .post('/api/v1/users/me/reset')
      .send({ confirmEmail: user.email, password: PASSWORD, keepCategories: true })
      .expect(200);
    expect(await state()).toMatchObject({ status: 'IN_PROGRESS', progress: 0 });
  });

  it('tells the plan limits for what the steps create', async () => {
    await ctx.prisma.plan.updateMany({
      where: { key: 'free' },
      data: { limits: { ...UNLIMITED, maxAccounts: 3, maxCards: 1, maxFixed: 5 } },
    });
    await createAccount(ctx.app, user, { name: 'Santander' });
    expect((await state()).limits).toEqual({
      accounts: { max: 3, used: 1 },
      cards: { max: 1, used: 0 },
      fixed: { max: 5, used: 0 },
    });
  });

  it('rejects unknown steps and statuses', async () => {
    await api().patch('/api/v1/onboarding/steps/goals').send({ status: 'DONE' }).expect(400);
    await api().patch('/api/v1/onboarding/steps/fixed').send({ status: 'PENDING' }).expect(400);
    await request(ctx.app.getHttpServer()).get('/api/v1/onboarding').expect(401);
  });

  it("one user's steps never touch another's (isolation)", async () => {
    const other = await registerUser(ctx.app, { email: 'beto@test.platin' });
    await mark('accounts', 'DONE', other);
    await api(other).post('/api/v1/onboarding/dismiss').expect(200);
    await createAccount(ctx.app, other, { name: 'Galicia' });
    expect(await state()).toMatchObject({
      progress: 0,
      dismissedAt: null,
      limits: { accounts: { used: 0 } },
    });
  });

  it('the admin metrics count who finished it and where the rest stopped (ADM-02)', async () => {
    const admin = await registerUser(ctx.app, { email: ADMIN_EMAIL });
    await mark('accounts', 'SKIPPED', admin);
    await mark('cards', 'SKIPPED', admin);
    await mark('fixed', 'DONE', admin);
    const beto = await registerUser(ctx.app, { email: 'beto@test.platin' });
    await mark('accounts', 'DONE', beto);
    await mark('cards', 'DONE', beto);
    await mark('cardCharges', 'LATER', beto);
    const old = await registerUser(ctx.app, { email: 'old@test.platin' });
    await ctx.prisma.user.update({ where: { id: old.id }, data: { preferences: {} } });

    const metrics = (await api(admin).get('/api/v1/admin/metrics').expect(200))
      .body as AdminMetrics;
    expect(metrics.onboarding).toEqual({
      started: 3,
      finished: 1,
      stoppedAt: { none: 1, accounts: 0, cards: 0, cardCharges: 1, fixed: 0 },
    });
  });
});
