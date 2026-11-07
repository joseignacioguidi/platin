import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/** Phase 37: the month from start to end ("Cómo se llega al libre"). */
describe('dashboard: the whole month', () => {
  let ctx: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.rates.failing = false;
    user = await registerUser(ctx.app, { name: 'José' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /**
   * Galicia with $ 500.000 and USD 100 to start, a September salary, and in October: salary,
   * an expense, the September statement paid, money to and from a savings reserve, dollars
   * bought, a negative adjustment, a fixed expense and a fixed income still pending.
   */
  async function month() {
    const api = as(ctx.app, user);
    const galicia = await createPocket(ctx.app, user, {
      name: 'Galicia',
      initialBalance: '500000',
    });
    const dollars = await addPocket(ctx.app, user, galicia.accountId, {
      name: 'Dólares',
      kind: 'AVAILABLE',
      currency: 'USD',
      initialBalance: '100',
    });
    const savings = await addPocket(ctx.app, user, galicia.accountId, { name: 'Ahorro' });
    const salary = await category(ctx.app, user, 'Sueldo');
    const food = await category(ctx.app, user, 'Supermercado');
    const rent = await category(ctx.app, user, 'Alquiler');
    const tx = (body: Record<string, unknown>) =>
      api
        .post('/api/v1/transactions')
        .send({ pocketId: galicia.id, ...body })
        .expect(201);
    await tx({ type: 'INCOME', categoryId: salary.id, amount: '200000', date: '2026-09-10' });
    await tx({ type: 'INCOME', categoryId: salary.id, amount: '1000000', date: '2026-10-01' });
    await tx({
      type: 'EXPENSE',
      categoryId: food.id,
      amount: '50000',
      date: '2026-10-03',
      description: 'Coto',
    });

    const card = (
      await api.post('/api/v1/cards').send({ name: 'Visa', closingDay: 30, dueDay: 5 }).expect(201)
    ).body;
    await api
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Zapatillas',
        categoryId: food.id,
        totalAmount: '90000',
        currency: 'ARS',
        date: '2026-09-15',
      })
      .expect(201);
    const statements = (
      await api.get(`/api/v1/cards/${card.id}/statements?from=2026-09&to=2026-12`).expect(200)
    ).body as { id: string; period: string }[];
    const september = statements.find((s) => s.period === '2026-09');
    await api.post(`/api/v1/statements/${september?.id}/close`).send({}).expect(200);
    await api
      .post(`/api/v1/statements/${september?.id}/payments`)
      .send({ pocketId: galicia.id, currency: 'ARS', amount: '90000', date: '2026-10-05' })
      .expect(201);

    const transfer = (body: Record<string, unknown>) =>
      api.post('/api/v1/transfers').send(body).expect(201);
    await transfer({
      fromPocketId: galicia.id,
      toPocketId: savings.id,
      amountOut: '300000',
      date: '2026-10-06',
    });
    await transfer({
      fromPocketId: savings.id,
      toPocketId: galicia.id,
      amountOut: '20000',
      date: '2026-10-08',
    });
    await transfer({
      fromPocketId: galicia.id,
      toPocketId: dollars.id,
      amountOut: '120000',
      amountIn: '100',
      date: '2026-10-10',
    });
    // 500.000 + 200.000 + 1.000.000 − 50.000 − 90.000 − 300.000 + 20.000 − 120.000 = 1.160.000.
    await api
      .post(`/api/v1/pockets/${galicia.id}/adjust`)
      .send({ balance: '1155000', date: '2026-10-12' })
      .expect(200);

    const fixed = (body: Record<string, unknown>) =>
      api
        .post('/api/v1/fixed')
        .send({ pocketId: galicia.id, startPeriod: '2026-10', ...body })
        .expect(201);
    await fixed({
      kind: 'EXPENSE',
      name: 'Alquiler',
      categoryId: rent.id,
      amount: '380000',
      dayOfMonth: 28,
    });
    await fixed({
      kind: 'INCOME',
      name: 'Bono',
      categoryId: salary.id,
      amount: '400000',
      dayOfMonth: 30,
    });
    await api.post('/api/v1/sync').expect(200);
    return { galicia, dollars, savings, card };
  }

  it('keeps the free amount it had before phase 37', async () => {
    await month();
    const res = await as(ctx.app, user).get('/api/v1/dashboard').expect(200);
    // ARS 1.155.000 + USD 200 × 1.200; to collect the bonus; to pay the rent.
    expect(res.body).toMatchObject({
      inAccounts: '1395000.00',
      toCollect: '400000.00',
      toPay: '380000.00',
      free: '1415000.00',
    });
  });
});
