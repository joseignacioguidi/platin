import type { Account, AccountsResponse, Card, Category, Goal, Pocket } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/**
 * Phase 23 (MON-01 to 05). Fake rates: dollar MEP 1200 (preferred), euro 1680 oficial.
 */
describe('currencies', () => {
  let ctx: TestContext;
  let user: TestUser;
  let mercadoPago: Account;
  let pesos: Pocket;
  let food: Category;

  const api = () => as(ctx.app, user);
  const enable = (currencies: string[]) => api().patch('/api/v1/users/me').send({ currencies });
  const euroPocket = () =>
    addPocket(ctx.app, user, mercadoPago.id, { name: 'Euros', currency: 'EUR' });

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    mercadoPago = await createAccount(ctx.app, user, {
      name: 'Mercado Pago',
      initialBalance: '500000',
    });
    pesos = mercadoPago.pockets[0];
    food = await category(ctx.app, user, 'Supermercado');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('pesos and dollars come enabled; pesos and the base can never be turned off (MON-01)', async () => {
    const me = await api().get('/api/v1/users/me').expect(200);
    expect(me.body.currencies).toEqual(['ARS', 'USD']);
    const res = await enable(['EUR']).expect(200);
    // USD was turned off (nothing uses it); ARS stays because it's pesos and the base.
    expect(res.body.currencies).toEqual(['ARS', 'EUR']);
    const usdBase = await api()
      .patch('/api/v1/users/me')
      .send({ baseCurrency: 'USD', currencies: ['EUR'] })
      .expect(200);
    expect(usdBase.body.currencies).toEqual(['ARS', 'USD', 'EUR']);
    await api().patch('/api/v1/users/me').send({ baseCurrency: 'EUR' }).expect(400);
    await enable(['ARS', 'XYZ']).expect(400);
  });

  it('a currency must be enabled to create a pocket, a goal or a fixed item (CURRENCY_NOT_ENABLED)', async () => {
    const pocket = await api()
      .post(`/api/v1/accounts/${mercadoPago.id}/pockets`)
      .send({ name: 'Euros', kind: 'SAVINGS', currency: 'EUR', instrument: null })
      .expect(422);
    expect(pocket.body.code).toBe('CURRENCY_NOT_ENABLED');
    const goal = await api()
      .post('/api/v1/goals')
      .send({ name: 'Viaje', targetAmount: '3000', currency: 'BRL', targetPeriod: '2027-06' })
      .expect(422);
    expect(goal.body.code).toBe('CURRENCY_NOT_ENABLED');
  });

  it('the scenario of the phase: euro pocket, buying euros with pesos, totals and a goal', async () => {
    await enable(['ARS', 'USD', 'EUR']).expect(200);
    const euros = await euroPocket();
    expect(euros.currency).toBe('EUR');

    // Buying € 100 with $ 168.000: the rate is the one implied by the two amounts.
    const bought = await api()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: pesos.id,
        toPocketId: euros.id,
        amountOut: '168000',
        amountIn: '100',
        date: '2026-10-23',
      })
      .expect(201);
    expect(bought.body).toMatchObject({
      amountOut: '168000.00',
      currencyOut: 'ARS',
      amountIn: '100.00',
      currencyIn: 'EUR',
      impliedRate: '1680.000000',
    });
    expect(await balanceOf(ctx.app, user, euros.id)).toBe('100.00');

    // MON-03: one line per currency in use and the total valued in pesos (€ at 1680).
    const accounts: AccountsResponse = (await api().get('/api/v1/accounts').expect(200)).body;
    expect(accounts.totals).toEqual([
      { currency: 'ARS', amount: '332000.00' },
      { currency: 'EUR', amount: '100.00' },
    ]);
    expect(accounts.totalBase).toEqual({ currency: 'ARS', amount: '500000.00' });

    // A goal in euros computes its monthly contribution from the euro pocket.
    const goal: Goal = (
      await api()
        .post('/api/v1/goals')
        .send({
          name: 'Viaje a Europa',
          targetAmount: '1300',
          currency: 'EUR',
          targetPeriod: '2027-10',
          pocketIds: [euros.id],
        })
        .expect(201)
    ).body;
    expect(goal.projection.accumulated).toBe('100.00');
    // € 1.200 left over the 12 months until October 2027.
    expect(goal.projection.monthlyNeeded).toBe('100.00');

    // MON-04: the euro can't be turned off while the pocket and the goal are active.
    const blocked = await enable(['ARS', 'USD']).expect(409);
    expect(blocked.body).toMatchObject({ code: 'CURRENCY_IN_USE', currencies: ['EUR'] });

    // Savings value the euros in USD through the peso: 100 × 1680 / 1200 = 140.
    const savings = (await api().get('/api/v1/savings').expect(200)).body;
    expect(savings.byCurrency).toContainEqual({
      currency: 'EUR',
      amount: '100.00',
      valueUsd: '140.00',
    });
  });

  it('an expense in euros freezes its value in pesos with the euro rate of the day', async () => {
    await enable(['ARS', 'USD', 'EUR']).expect(200);
    const euros = await addPocket(ctx.app, user, mercadoPago.id, {
      name: 'Euros',
      kind: 'AVAILABLE',
      currency: 'EUR',
      initialBalance: '50',
    });
    const res = await api()
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: euros.id,
        categoryId: food.id,
        amount: '10',
        date: '2026-10-23',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      currency: 'EUR',
      rateToBase: '1680.000000',
      baseAmount: '16800.00',
    });
  });

  it('a transfer EUR → USD records the rate as dollars per euro', async () => {
    await enable(['ARS', 'USD', 'EUR']).expect(200);
    const euros = await addPocket(ctx.app, user, mercadoPago.id, {
      name: 'Euros',
      currency: 'EUR',
      initialBalance: '200',
    });
    const dollars = await addPocket(ctx.app, user, mercadoPago.id, {
      name: 'Dólares',
      currency: 'USD',
    });
    const res = await api()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: euros.id,
        toPocketId: dollars.id,
        amountOut: '100',
        amountIn: '108',
        date: '2026-10-23',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      currencyOut: 'EUR',
      currencyIn: 'USD',
      impliedRate: '1.080000',
    });
    expect(await balanceOf(ctx.app, user, euros.id)).toBe('100.00');
    expect(await balanceOf(ctx.app, user, dollars.id)).toBe('108.00');
  });

  it('cards stay in pesos and dollars (MON-05)', async () => {
    await enable(['ARS', 'USD', 'EUR']).expect(200);
    const card: Card = (
      await api()
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 30, dueDay: 5 })
        .expect(201)
    ).body;
    await api()
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        categoryId: food.id,
        currency: 'EUR',
        description: 'Hotel',
        date: '2026-10-10',
        totalAmount: '100',
      })
      .expect(400);
    await api()
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Netflix',
        categoryId: food.id,
        cardId: card.id,
        currency: 'EUR',
        amount: '10',
        dayOfMonth: 1,
        startPeriod: '2026-10',
      })
      .expect(400);
  });

  it('a currency used only by history can be turned off (MON-04)', async () => {
    await enable(['ARS', 'USD', 'EUR']).expect(200);
    const euros = await euroPocket();
    await api().patch(`/api/v1/pockets/${euros.id}`).send({ archived: true }).expect(200);
    const res = await enable(['ARS', 'USD']).expect(200);
    expect(res.body.currencies).toEqual(['ARS', 'USD']);
    // Bringing the pocket back needs the euro enabled again.
    const restore = await api()
      .patch(`/api/v1/pockets/${euros.id}`)
      .send({ archived: false })
      .expect(422);
    expect(restore.body.code).toBe('CURRENCY_NOT_ENABLED');
  });

  it("isolation: one user's currencies don't affect another's", async () => {
    await enable(['ARS', 'USD', 'EUR']).expect(200);
    await euroPocket();
    const other = as(ctx.app, await registerUser(ctx.app));
    const me = await other.get('/api/v1/users/me').expect(200);
    expect(me.body.currencies).toEqual(['ARS', 'USD']);
    // The other user can turn off dollars: my euro pocket doesn't count for them.
    await other
      .patch('/api/v1/users/me')
      .send({ currencies: ['ARS'] })
      .expect(200);
  });
});
