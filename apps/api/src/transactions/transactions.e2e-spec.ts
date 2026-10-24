import type { Account, Category } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('transactions', () => {
  let ctx: TestContext;
  let user: TestUser;
  let wallet: Account;
  let food: Category;
  let salary: Category;

  const expense = (overrides: Record<string, unknown> = {}) => ({
    type: 'EXPENSE',
    accountId: wallet.id,
    categoryId: food.id,
    amount: '18500',
    date: '2026-10-23',
    description: 'Coto',
    ...overrides,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    wallet = await createAccount(ctx.app, user, { initialBalance: '100000' });
    food = await category(ctx.app, user, 'Supermercado');
    salary = await category(ctx.app, user, 'Sueldo');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates an expense in base currency with rate 1', async () => {
    const res = await as(ctx.app, user).post('/api/v1/transactions').send(expense()).expect(201);
    expect(res.body).toMatchObject({
      type: 'EXPENSE',
      status: 'CONFIRMED',
      origin: 'MANUAL',
      amount: '18500.00',
      currency: 'ARS',
      rateToBase: '1.000000',
      baseAmount: '18500.00',
      date: '2026-10-23',
      description: 'Coto',
    });
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('81500.00');
  });

  it('a movement in dollars freezes the rate of the day (preferred type) or the one sent', async () => {
    const usd = await createAccount(ctx.app, user, { currency: 'USD', name: 'Caja USD' });
    const api = as(ctx.app, user);
    // Default preference MEP: sell 1200 in the fake provider.
    const auto = await api
      .post('/api/v1/transactions')
      .send(expense({ accountId: usd.id, amount: '24.99' }))
      .expect(201);
    expect(auto.body).toMatchObject({ rateToBase: '1200.000000', baseAmount: '29988.00' });

    await api.patch('/api/v1/users/me').send({ valuationRate: 'BLUE' }).expect(200);
    const blue = await api
      .post('/api/v1/transactions')
      .send(expense({ accountId: usd.id, amount: '10' }))
      .expect(201);
    expect(blue.body.rateToBase).toBe('1565.000000');

    const res = await api
      .post('/api/v1/transactions')
      .send(expense({ accountId: usd.id, amount: '24.99', exchangeRate: '1250.50' }))
      .expect(201);
    expect(res.body).toMatchObject({
      currency: 'USD',
      rateToBase: '1250.500000',
      baseAmount: '31250.00',
    });
  });

  it('the category must match the type', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/transactions')
      .send(expense({ categoryId: salary.id }))
      .expect(422);
    expect(res.body.code).toBe('CATEGORY_KIND_MISMATCH');
  });

  it('rejects zero, negative and float-like amounts', async () => {
    const api = as(ctx.app, user);
    await api
      .post('/api/v1/transactions')
      .send(expense({ amount: '0' }))
      .expect(400);
    await api
      .post('/api/v1/transactions')
      .send(expense({ amount: '-10' }))
      .expect(400);
    await api
      .post('/api/v1/transactions')
      .send(expense({ amount: 18500 }))
      .expect(400);
    await api
      .post('/api/v1/transactions')
      .send(expense({ amount: '10.005' }))
      .expect(400);
  });

  it('edits and deletes a movement (MOV-04)', async () => {
    const api = as(ctx.app, user);
    const created = await api.post('/api/v1/transactions').send(expense()).expect(201);
    const edited = await api
      .patch(`/api/v1/transactions/${created.body.id}`)
      .send({ amount: '20000', description: 'Coto grande', date: '2026-10-22' })
      .expect(200);
    expect(edited.body).toMatchObject({
      amount: '20000.00',
      baseAmount: '20000.00',
      description: 'Coto grande',
      date: '2026-10-22',
    });
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('80000.00');

    await api.delete(`/api/v1/transactions/${created.body.id}`).expect(204);
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('100000.00');
    await api.get(`/api/v1/transactions/${created.body.id}`).expect(404);
  });

  it('keeps the frozen rate when editing the description only', async () => {
    const usd = await createAccount(ctx.app, user, { currency: 'USD' });
    const api = as(ctx.app, user);
    const created = await api
      .post('/api/v1/transactions')
      .send(expense({ accountId: usd.id, amount: '10', exchangeRate: '1200' }))
      .expect(201);
    const edited = await api
      .patch(`/api/v1/transactions/${created.body.id}`)
      .send({ description: 'Otro' })
      .expect(200);
    expect(edited.body).toMatchObject({ rateToBase: '1200.000000', baseAmount: '12000.00' });
  });

  it('confirms pending movements in batch, with a corrected amount (MOV-05)', async () => {
    const pending = async (amount: string) =>
      ctx.prisma.transaction.create({
        data: {
          userId: user.id,
          accountId: wallet.id,
          categoryId: food.id,
          type: 'EXPENSE',
          status: 'PENDING',
          origin: 'FIXED',
          amount,
          currency: 'ARS',
          rateToBase: '1',
          baseAmount: amount,
          date: new Date('2026-10-10'),
        },
      });
    const rent = await pending('38000');
    const internet = await pending('9000');
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('100000.00');

    const res = await as(ctx.app, user)
      .post('/api/v1/transactions/confirm')
      .send({ items: [{ id: rent.id, amount: '40000' }, { id: internet.id }] })
      .expect(200);
    expect(res.body.map((t: { status: string }) => t.status)).toEqual(['CONFIRMED', 'CONFIRMED']);
    expect(res.body[0]).toMatchObject({ amount: '40000.00', baseAmount: '40000.00' });
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('51000.00');
  });

  it('isolation: another user cannot read, edit, delete, confirm or use my resources', async () => {
    const mine = await as(ctx.app, user).post('/api/v1/transactions').send(expense()).expect(201);
    const other = await registerUser(ctx.app);
    const api = as(ctx.app, other);
    await api.get(`/api/v1/transactions/${mine.body.id}`).expect(404);
    await api.patch(`/api/v1/transactions/${mine.body.id}`).send({ amount: '1' }).expect(404);
    await api.delete(`/api/v1/transactions/${mine.body.id}`).expect(404);
    await api
      .post('/api/v1/transactions/confirm')
      .send({ items: [{ id: mine.body.id }] })
      .expect(404);
    // Using my account or category from another user's request is also a 404.
    await api.post('/api/v1/transactions').send(expense()).expect(404);
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('81500.00');
  });
});
