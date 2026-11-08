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

  it('lists what was reserved per reserve, net of withdrawals (DAS-05)', async () => {
    const { galicia, savings } = await month();
    const api = as(ctx.app, user);
    const trip = await addPocket(ctx.app, user, galicia.accountId, { name: 'Viaje' });
    await api
      .post('/api/v1/transfers')
      .send({
        fromPocketId: galicia.id,
        toPocketId: trip.id,
        amountOut: '50000',
        date: '2026-10-15',
      })
      .expect(201);
    const res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body.reserved).toBe('330000.00');
    expect(res.body.reservedByPocket).toEqual([
      { pocketId: savings.id, name: 'Ahorro', amount: '280000.00' },
      { pocketId: trip.id, name: 'Viaje', amount: '50000.00' },
    ]);
  });

  it('splits the month into opening, collected, paid out, reserved and other (DAS-05)', async () => {
    await month();
    const res = await as(ctx.app, user).get('/api/v1/dashboard').expect(200);
    // Opening: ARS 700.000 + USD 100 × 1.200. Paid out: Coto + the September statement.
    // Reserved: 300.000 − 20.000. Other: the −5.000 adjustment; the dollars bought cost 120.000
    // and are worth 120.000 today.
    expect(res.body).toMatchObject({
      opening: '820000.00',
      received: '1000000.00',
      paidOut: '140000.00',
      reserved: '280000.00',
      other: '-5000.00',
      free: '1415000.00',
    });
    expect(res.body).not.toHaveProperty('spent');
  });

  it('a previous month: what there was, came in, went out and was left', async () => {
    await month();
    const res = await as(ctx.app, user).get('/api/v1/dashboard?period=2026-09').expect(200);
    expect(res.body).toMatchObject({
      opening: '620000.00',
      received: '200000.00',
      paidOut: '0.00',
      reserved: '0.00',
      other: '0.00',
      toCollect: '0.00',
      toPay: '0.00',
      inAccounts: '820000.00',
      free: '820000.00',
    });
  });

  it('the example of the rule "Cómo se llega al libre", with and without excess', async () => {
    const api = as(ctx.app, user);
    const pocket = await createPocket(ctx.app, user, { name: 'Banco', initialBalance: '300000' });
    const savings = await addPocket(ctx.app, user, pocket.accountId, { name: 'Auto' });
    const salary = await category(ctx.app, user, 'Sueldo');
    const food = await category(ctx.app, user, 'Supermercado');
    const rent = await category(ctx.app, user, 'Alquiler');
    const tx = (body: Record<string, unknown>) =>
      api
        .post('/api/v1/transactions')
        .send({ pocketId: pocket.id, ...body })
        .expect(201);
    await tx({ type: 'INCOME', categoryId: salary.id, amount: '1600000', date: '2026-10-01' });
    await tx({ type: 'EXPENSE', categoryId: food.id, amount: '650000', date: '2026-10-02' });
    const fixed = (body: Record<string, unknown>) =>
      api
        .post('/api/v1/fixed')
        .send({ pocketId: pocket.id, startPeriod: '2026-10', ...body })
        .expect(201);
    await fixed({
      kind: 'INCOME',
      name: 'Extra',
      categoryId: salary.id,
      amount: '400000',
      dayOfMonth: 30,
    });
    await fixed({
      kind: 'EXPENSE',
      name: 'Alquiler',
      categoryId: rent.id,
      amount: '397218',
      dayOfMonth: 28,
    });
    const save = (amount: string) =>
      api
        .post('/api/v1/transfers')
        .send({
          fromPocketId: pocket.id,
          toPocketId: savings.id,
          amountOut: amount,
          date: '2026-10-05',
        })
        .expect(201);
    await save('904000');

    let res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      opening: '300000.00',
      received: '1600000.00',
      toCollect: '400000.00',
      paidOut: '650000.00',
      reserved: '904000.00',
      toPay: '397218.00',
      other: '0.00',
      inAccounts: '346000.00',
      free: '348782.00',
    });

    await save('396000');
    res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      reserved: '1300000.00',
      inAccounts: '-50000.00',
      free: '-47218.00',
    });
  });

  it('GET /dashboard/summary groups by category, card and reserve', async () => {
    const { card, savings } = await month();
    const res = await as(ctx.app, user).get('/api/v1/dashboard/summary?period=2026-10').expect(200);
    expect(res.body).toMatchObject({
      period: '2026-10',
      currency: 'ARS',
      opening: '820000.00',
      received: '1000000.00',
      toCollect: '400000.00',
      paidOut: '140000.00',
      reserved: '280000.00',
      other: '-5000.00',
      toPay: '380000.00',
      free: '1415000.00',
    });
    expect(res.body.income).toEqual([
      expect.objectContaining({ name: 'Sueldo', amount: '1000000.00' }),
    ]);
    expect(res.body.income[0].movements).toHaveLength(1);
    expect(res.body.paidByCategory).toEqual([
      expect.objectContaining({ name: 'Supermercado', amount: '50000.00' }),
    ]);
    // The September statement, paid in October, covers the purchases of September.
    expect(res.body.paidByCard).toEqual([
      expect.objectContaining({
        key: card.id,
        name: 'Visa',
        amount: '90000.00',
        purchases: { from: '2026-08-31', to: '2026-09-30' },
      }),
    ]);
    expect(res.body.paidByCard[0].movements[0]).toMatchObject({
      kind: 'TRANSFER',
      amountOut: '90000.00',
      statement: { cardName: 'Visa', period: '2026-09' },
    });
    // Reserves and withdrawals: 300.000 in, 20.000 back.
    expect(res.body.reservedByPocket).toEqual([
      expect.objectContaining({ key: savings.id, name: 'Ahorro', amount: '280000.00' }),
    ]);
    expect(res.body.reservedByPocket[0].movements).toHaveLength(2);
  });

  it('GET /dashboard/summary puts the categories after the 6 largest in "Otras"', async () => {
    const api = as(ctx.app, user);
    const pocket = await createPocket(ctx.app, user, { name: 'Banco', initialBalance: '100000' });
    const categories = (await api.get('/api/v1/categories').expect(200)).body as {
      id: string;
      name: string;
      kind: string;
      parentId: string | null;
    }[];
    const expenses = categories.filter((c) => c.kind === 'EXPENSE' && !c.parentId).slice(0, 8);
    expect(expenses).toHaveLength(8);
    for (const [index, spending] of expenses.entries()) {
      const i = index + 1;
      await api
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: pocket.id,
          categoryId: spending.id,
          amount: String(i * 100),
          date: '2026-10-02',
        })
        .expect(201);
    }
    const res = await api.get('/api/v1/dashboard/summary?period=2026-10').expect(200);
    const groups = res.body.paidByCategory as { key: string; name: string; amount: string }[];
    expect(groups.map((g) => g.name)).toEqual([
      ...expenses
        .slice(2)
        .reverse()
        .map((c) => c.name),
      '',
    ]);
    expect(groups[6]).toMatchObject({ key: 'OTHER', amount: '300.00' });
  });

  it('GET /dashboard/income lists what was collected and what is still to collect', async () => {
    await month();
    const api = as(ctx.app, user);
    const res = await api.get('/api/v1/dashboard/income?period=2026-10').expect(200);
    expect(res.body).toMatchObject({
      period: '2026-10',
      received: '1000000.00',
      toCollect: '400000.00',
      collected: [expect.objectContaining({ kind: 'TRANSACTION', amount: '1000000.00' })],
      pending: [
        expect.objectContaining({
          type: 'FIXED',
          name: 'Bono',
          date: '2026-10-30',
          amount: '400000.00',
          payFrom: expect.objectContaining({ accountName: 'Galicia' }),
        }),
      ],
    });
    const september = await api.get('/api/v1/dashboard/income?period=2026-09').expect(200);
    expect(september.body).toMatchObject({
      received: '200000.00',
      toCollect: '0.00',
      pending: [],
    });
  });

  it('the summary and the incomes need a period', async () => {
    const api = as(ctx.app, user);
    await api.get('/api/v1/dashboard/summary').expect(400);
    await api.get('/api/v1/dashboard/income?period=octubre').expect(400);
  });

  it('isolation: another user sees an empty month', async () => {
    await month();
    const other = await registerUser(ctx.app, { name: 'Otra' });
    const summary = await as(ctx.app, other)
      .get('/api/v1/dashboard/summary?period=2026-10')
      .expect(200);
    expect(summary.body).toMatchObject({
      opening: '0.00',
      received: '0.00',
      paidOut: '0.00',
      free: '0.00',
      income: [],
      paidByCategory: [],
      paidByCard: [],
      reservedByPocket: [],
    });
    const income = await as(ctx.app, other)
      .get('/api/v1/dashboard/income?period=2026-10')
      .expect(200);
    expect(income.body).toMatchObject({ collected: [], pending: [] });
    const home = await as(ctx.app, other).get('/api/v1/dashboard').expect(200);
    expect(home.body).toMatchObject({ reserved: '0.00', reservedByPocket: [] });
  });
});
