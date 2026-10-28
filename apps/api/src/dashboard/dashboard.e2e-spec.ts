import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('dashboard', () => {
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
   * October 2026 with: salary 1.850.000 (fixed, pending), rent 380.000 (fixed, pending),
   * Coto 18.500 (confirmed expense), PedidosYa 12.300 and Spotify USD 10 (card purchases),
   * and a September card purchase whose statement is due on Oct 5.
   */
  async function scenario() {
    const api = as(ctx.app, user);
    const galicia = await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '0' });
    const ids = {
      salary: (await category(ctx.app, user, 'Sueldo')).id,
      rent: (await category(ctx.app, user, 'Alquiler')).id,
      food: (await category(ctx.app, user, 'Supermercado')).id,
      delivery: (await category(ctx.app, user, 'Delivery')).id,
    };
    const fixed = (body: Record<string, unknown>) =>
      api
        .post('/api/v1/fixed')
        .send({ pocketId: galicia.id, startPeriod: '2026-10', ...body })
        .expect(201);
    await fixed({
      kind: 'INCOME',
      name: 'Sueldo',
      categoryId: ids.salary,
      amount: '1850000',
      dayOfMonth: 1,
    });
    await fixed({
      kind: 'EXPENSE',
      name: 'Alquiler',
      categoryId: ids.rent,
      amount: '380000',
      dayOfMonth: 28,
    });
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: galicia.id,
        categoryId: ids.food,
        amount: '18500',
        date: '2026-10-22',
        description: 'Coto',
      })
      .expect(201);
    const card = (
      await api
        .post('/api/v1/cards')
        .send({ name: 'Visa Galicia', closingDay: 30, dueDay: 5 })
        .expect(201)
    ).body;
    // September purchase: in the September statement, due October 5... already past on the 23rd,
    // so it's committed for October but not in the next 30 days.
    await api
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Zapatillas',
        categoryId: ids.food,
        totalAmount: '90000',
        currency: 'ARS',
        date: '2026-09-15',
        installmentsCount: 3,
      })
      .expect(201);
    await api
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'PedidosYa',
        categoryId: ids.delivery,
        totalAmount: '12300',
        currency: 'ARS',
        date: '2026-10-20',
      })
      .expect(201);
    await api
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Spotify',
        categoryId: ids.delivery,
        totalAmount: '10',
        currency: 'USD',
        date: '2026-10-21',
      })
      .expect(201);
    await api.post('/api/v1/sync').expect(200);
    return { galicia, card };
  }

  it('computes "Libre este mes" = expected income − committed − spent', async () => {
    await scenario();
    const res = await as(ctx.app, user).get('/api/v1/dashboard').expect(200);
    // spent = 18.500 + 12.300 + USD 10 × 1.200; committed = rent 380.000 + Sept installment 30.000
    expect(res.body).toMatchObject({
      period: '2026-10',
      currency: 'ARS',
      expectedIncome: '1850000.00',
      spent: '42800.00',
      committed: '410000.00',
      free: '1397200.00',
      pending: { count: 2, names: ['Sueldo', 'Alquiler'] },
      rate: { type: 'MEP', sell: '1200.000000', date: '2026-10-23', stale: false },
    });
  });

  it('confirming a fixed expense moves it from committed to spent', async () => {
    await scenario();
    const api = as(ctx.app, user);
    const pending = (await api.get('/api/v1/movements?status=PENDING').expect(200)).body.items;
    const rent = pending.find((m: { description: string }) => m.description === 'Alquiler');
    await api
      .post('/api/v1/transactions/confirm')
      .send({ items: [{ id: rent.id, amount: '400000' }] })
      .expect(200);
    const res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      spent: '442800.00',
      committed: '30000.00',
      free: '1377200.00',
      pending: { count: 1, names: ['Sueldo'] },
    });
  });

  // Today + 30 days = Nov 22: the November rent (28th) is out of the window.
  it('lists the next 30 days: statements due and fixed items not confirmed', async () => {
    await scenario();
    const res = await as(ctx.app, user).get('/api/v1/dashboard').expect(200);
    expect(
      res.body.upcoming.map(
        (i: { type: string; date: string; name?: string; cardName?: string }) =>
          `${i.date} ${i.type} ${i.name ?? i.cardName}`,
      ),
    ).toEqual([
      '2026-10-28 FIXED Alquiler',
      '2026-11-01 FIXED Sueldo',
      '2026-11-05 STATEMENT Visa Galicia',
    ]);
    const statement = res.body.upcoming.find((i: { type: string }) => i.type === 'STATEMENT');
    expect(statement).toMatchObject({ ARS: '42300.00', USD: '10.00' });
  });

  it('reports a stale rate when the source is down', async () => {
    await ctx.prisma.exchangeRate.create({
      data: {
        date: new Date('2026-10-22'),
        type: 'MEP',
        buy: '1180',
        sell: '1190',
        source: 'fake',
      },
    });
    ctx.rates.failing = true;
    const res = await as(ctx.app, user).get('/api/v1/dashboard').expect(200);
    expect(res.body.rate).toEqual({
      type: 'MEP',
      sell: '1190.000000',
      date: '2026-10-22',
      stale: true,
    });
  });

  it('isolation: another user sees an empty month', async () => {
    await scenario();
    const other = await registerUser(ctx.app);
    const res = await as(ctx.app, other).get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      expectedIncome: '0.00',
      spent: '0.00',
      committed: '0.00',
      free: '0.00',
      pending: { count: 0 },
      upcoming: [],
    });
  });
});
