import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('accounts', () => {
  let ctx: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates an account with its initial balance as balance', async () => {
    const account = await createAccount(ctx.app, user, { initialBalance: '150000.50' });
    expect(account).toMatchObject({
      name: 'Mercado Pago',
      type: 'WALLET',
      currency: 'ARS',
      initialBalance: '150000.50',
      balance: '150000.50',
      archived: false,
    });
  });

  it('lists accounts with totals per currency', async () => {
    await createAccount(ctx.app, user, { name: 'Galicia', type: 'BANK', initialBalance: '1000' });
    await createAccount(ctx.app, user, { name: 'MP', initialBalance: '500.25' });
    await createAccount(ctx.app, user, {
      name: 'Caja USD',
      type: 'SAVINGS',
      currency: 'USD',
      initialBalance: '3000',
    });
    const res = await as(ctx.app, user).get('/api/v1/accounts').expect(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.totals).toEqual({ ARS: '1500.25', USD: '3000.00' });
  });

  it('calculates the balance from confirmed movements only', async () => {
    const account = await createAccount(ctx.app, user, { initialBalance: '100000' });
    const food = await category(ctx.app, user, 'Supermercado');
    const salary = await category(ctx.app, user, 'Sueldo');
    const api = as(ctx.app, user);
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        accountId: account.id,
        categoryId: food.id,
        amount: '18500',
        date: '2026-10-23',
      })
      .expect(201);
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'INCOME',
        accountId: account.id,
        categoryId: salary.id,
        amount: '1850000',
        date: '2026-10-20',
      })
      .expect(201);
    // A pending movement doesn't count until it is confirmed.
    await ctx.prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: 'EXPENSE',
        status: 'PENDING',
        amount: '380000',
        currency: 'ARS',
        rateToBase: '1',
        baseAmount: '380000',
        date: new Date('2026-10-10'),
      },
    });
    expect(await balanceOf(ctx.app, user, account.id)).toBe('1931500.00');
  });

  it('adjusts the balance with a signed adjustment movement (CTA-04)', async () => {
    const account = await createAccount(ctx.app, user, { initialBalance: '1000' });
    const res = await as(ctx.app, user)
      .post(`/api/v1/accounts/${account.id}/adjust`)
      .send({ balance: '850.50', date: '2026-10-23' })
      .expect(200);
    expect(res.body.adjustment).toMatchObject({
      type: 'ADJUSTMENT',
      origin: 'ADJUSTMENT',
      amount: '-149.50',
      baseAmount: '-149.50',
    });
    expect(await balanceOf(ctx.app, user, account.id)).toBe('850.50');

    const same = await as(ctx.app, user)
      .post(`/api/v1/accounts/${account.id}/adjust`)
      .send({ balance: '850.50', date: '2026-10-23' })
      .expect(200);
    expect(same.body.adjustment).toBeNull();
  });

  it('asks for the rate to adjust an account in another currency', async () => {
    const usd = await createAccount(ctx.app, user, { currency: 'USD', initialBalance: '100' });
    const res = await as(ctx.app, user)
      .post(`/api/v1/accounts/${usd.id}/adjust`)
      .send({ balance: '120', date: '2026-10-23' })
      .expect(422);
    expect(res.body.code).toBe('EXCHANGE_RATE_REQUIRED');
    const ok = await as(ctx.app, user)
      .post(`/api/v1/accounts/${usd.id}/adjust`)
      .send({ balance: '120', date: '2026-10-23', exchangeRate: '1200' })
      .expect(200);
    expect(ok.body.adjustment).toMatchObject({ amount: '20.00', baseAmount: '24000.00' });
  });

  it('archives and hides an account, and rejects new movements on it', async () => {
    const account = await createAccount(ctx.app, user);
    await as(ctx.app, user)
      .patch(`/api/v1/accounts/${account.id}`)
      .send({ archived: true })
      .expect(200);
    expect((await as(ctx.app, user).get('/api/v1/accounts').expect(200)).body.items).toHaveLength(
      0,
    );
    expect(
      (await as(ctx.app, user).get('/api/v1/accounts?archived=true').expect(200)).body.items,
    ).toHaveLength(1);
    const food = await category(ctx.app, user, 'Supermercado');
    const res = await as(ctx.app, user)
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        accountId: account.id,
        categoryId: food.id,
        amount: '10',
        date: '2026-10-23',
      })
      .expect(422);
    expect(res.body.code).toBe('ACCOUNT_ARCHIVED');
  });

  it('validates the request', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/accounts')
      .send({ name: '', type: 'PIGGY', currency: 'EUR', initialBalance: '1.234' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
      'currency',
      'initialBalance',
      'name',
      'type',
    ]);
  });

  it('isolation: another user gets 404 on every account route', async () => {
    const account = await createAccount(ctx.app, user);
    const other = await registerUser(ctx.app);
    const api = as(ctx.app, other);
    await api.get(`/api/v1/accounts/${account.id}`).expect(404);
    await api.patch(`/api/v1/accounts/${account.id}`).send({ name: 'Mía' }).expect(404);
    await api
      .post(`/api/v1/accounts/${account.id}/adjust`)
      .send({ balance: '1', date: '2026-10-23' })
      .expect(404);
    expect((await api.get('/api/v1/accounts').expect(200)).body.items).toHaveLength(0);
  });
});
