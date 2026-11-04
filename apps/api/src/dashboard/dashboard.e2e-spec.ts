import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, category, createPocket } from '../../test/fixtures';
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

  it('computes "Libre este mes" from the balances (DAS-05)', async () => {
    await scenario();
    const res = await as(ctx.app, user).get('/api/v1/dashboard').expect(200);
    // in accounts = 0 − Coto 18.500; to collect = salary; to pay = rent 380.000 + Sept
    // installment 30.000; card later = PedidosYa 12.300 + USD 10 × 1.200 (due Nov 5).
    expect(res.body).toMatchObject({
      period: '2026-10',
      currency: 'ARS',
      inAccounts: '-18500.00',
      toCollect: '1850000.00',
      toPay: '410000.00',
      cardLater: '24300.00',
      free: '1397200.00',
      spent: '42800.00',
      saved: '0.00',
      // The rent (Oct 28) is not to confirm until its date.
      pending: { count: 1, names: ['Sueldo'] },
      rate: { type: 'MEP', sell: '1200.000000', date: '2026-10-23', stale: false },
    });
  });

  it('DAS-05: saving or investing lowers the free amount; a spending reserve does not', async () => {
    const { galicia } = await scenario();
    const api = as(ctx.app, user);
    const cedears = await addPocket(ctx.app, user, galicia.accountId, {
      name: 'CEDEARs',
      kind: 'INVESTMENT',
    });
    const reserva = await addPocket(ctx.app, user, galicia.accountId, { name: 'Reserva' });
    const previstos = await addPocket(ctx.app, user, galicia.accountId, {
      name: 'Gastos Previstos',
      kind: 'SPENDING',
    });
    const mp = await createPocket(ctx.app, user, { name: 'Mercado Pago' });
    const transfer = (from: string, to: string, amount: string) =>
      api
        .post('/api/v1/transfers')
        .send({ fromPocketId: from, toPocketId: to, amountOut: amount, date: '2026-10-23' })
        .expect(201);
    await transfer(galicia.id, cedears.id, '150000');
    await transfer(galicia.id, reserva.id, '50000');
    // Neither changes the free amount: between accounts, and to a spending reserve.
    await transfer(galicia.id, mp.id, '1000');
    await transfer(galicia.id, previstos.id, '20000');
    let res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      inAccounts: '-218500.00',
      saved: '200000.00',
      free: '1197200.00',
    });

    await transfer(reserva.id, galicia.id, '30000');
    res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({ saved: '170000.00', free: '1227200.00' });
  });

  it('DAS-05: the example of the specification', async () => {
    const api = as(ctx.app, user);
    const mp = await createPocket(ctx.app, user, {
      name: 'Mercado Pago',
      initialBalance: '726150',
    });
    for (const [name, initialBalance] of [
      ['Gastos Previstos', '220000'],
      ['Cuotas', '120000'],
      ['Extras', '110000'],
    ]) {
      await addPocket(ctx.app, user, mp.accountId, { name, kind: 'SPENDING', initialBalance });
    }
    const auto = await addPocket(ctx.app, user, mp.accountId, { name: 'Auto' });
    const rent = await category(ctx.app, user, 'Alquiler');
    const other = await category(ctx.app, user, 'Otros gastos');
    // To pay this month: $ 379.418,27.
    await api
      .post('/api/v1/fixed')
      .send({
        pocketId: mp.id,
        startPeriod: '2026-10',
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: rent.id,
        amount: '379418.27',
        dayOfMonth: 28,
      })
      .expect(201);
    let res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      inAccounts: '1176150.00',
      toCollect: '0.00',
      toPay: '379418.27',
      cardLater: '0.00',
      free: '796731.73',
    });

    // On the 20th, $ 90.000 in 3 installments due in December, January and February.
    const card = (
      await api.post('/api/v1/cards').send({ name: 'Visa', closingDay: 15, dueDay: 5 }).expect(201)
    ).body;
    await api
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Heladera',
        categoryId: other.id,
        totalAmount: '90000',
        currency: 'ARS',
        date: '2026-10-20',
        installmentsCount: 3,
      })
      .expect(201);
    res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({ cardLater: '90000.00', free: '706731.73' });

    await api
      .post('/api/v1/transfers')
      .send({ fromPocketId: mp.id, toPocketId: auto.id, amountOut: '200000', date: '2026-10-23' })
      .expect(201);
    res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({ free: '506731.73', saved: '200000.00' });
  });

  it('a previous month is what was left in the accounts on its last day', async () => {
    await scenario();
    const res = await as(ctx.app, user).get('/api/v1/dashboard?period=2026-09').expect(200);
    // Coto is from October: on September 30 the balance was 0.
    expect(res.body).toMatchObject({
      period: '2026-09',
      inAccounts: '0.00',
      toCollect: '0.00',
      toPay: '0.00',
      cardLater: '0.00',
      free: '0.00',
      // The September purchase still counts as spent in its month.
      spent: '90000.00',
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
      toPay: '30000.00',
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
      inAccounts: '0.00',
      toCollect: '0.00',
      toPay: '0.00',
      cardLater: '0.00',
      free: '0.00',
      spent: '0.00',
      saved: '0.00',
      pending: { count: 0 },
      upcoming: [],
    });
  });
});
