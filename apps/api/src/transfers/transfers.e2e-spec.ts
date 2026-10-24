import type { Account } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { balanceOf, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('transfers', () => {
  let ctx: TestContext;
  let user: TestUser;
  let galicia: Account;
  let wallet: Account;
  let dollars: Account;

  const transfer = (overrides: Record<string, unknown>) => ({ date: '2026-10-23', ...overrides });

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createAccount(ctx.app, user, {
      name: 'Galicia',
      type: 'BANK',
      initialBalance: '2000000',
    });
    wallet = await createAccount(ctx.app, user, { name: 'Mercado Pago' });
    dollars = await createAccount(ctx.app, user, {
      name: 'Caja USD',
      type: 'SAVINGS',
      currency: 'USD',
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('moves money between accounts of the same currency', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: galicia.id, toAccountId: wallet.id, amountOut: '50000' }))
      .expect(201);
    expect(res.body).toMatchObject({
      amountOut: '50000.00',
      amountIn: '50000.00',
      impliedRate: null,
    });
    expect(await balanceOf(ctx.app, user, galicia.id)).toBe('1950000.00');
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('50000.00');
  });

  it('buying dollars: both balances change and the rate comes from the two amounts', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send(
        transfer({
          fromAccountId: galicia.id,
          toAccountId: dollars.id,
          amountOut: '120000',
          amountIn: '100',
          description: 'Compra de dólares',
        }),
      )
      .expect(201);
    expect(res.body).toMatchObject({
      currencyOut: 'ARS',
      currencyIn: 'USD',
      impliedRate: '1200.000000',
    });
    expect(await balanceOf(ctx.app, user, galicia.id)).toBe('1880000.00');
    expect(await balanceOf(ctx.app, user, dollars.id)).toBe('100.00');

    // Selling some back closes the loop.
    await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send(
        transfer({
          fromAccountId: dollars.id,
          toAccountId: galicia.id,
          amountOut: '40',
          amountIn: '49000',
        }),
      )
      .expect(201);
    expect(await balanceOf(ctx.app, user, dollars.id)).toBe('60.00');
    expect(await balanceOf(ctx.app, user, galicia.id)).toBe('1929000.00');
  });

  it('requires the amount received between currencies and equal amounts otherwise', async () => {
    const api = as(ctx.app, user);
    const missing = await api
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: galicia.id, toAccountId: dollars.id, amountOut: '1000' }))
      .expect(422);
    expect(missing.body.code).toBe('TRANSFER_AMOUNT_IN_REQUIRED');
    const differ = await api
      .post('/api/v1/transfers')
      .send(
        transfer({
          fromAccountId: galicia.id,
          toAccountId: wallet.id,
          amountOut: '1000',
          amountIn: '999',
        }),
      )
      .expect(422);
    expect(differ.body.code).toBe('TRANSFER_AMOUNTS_DIFFER');
    await api
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: galicia.id, toAccountId: galicia.id, amountOut: '1' }))
      .expect(400);
  });

  it('deletes a transfer and restores both balances', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: galicia.id, toAccountId: wallet.id, amountOut: '50000' }))
      .expect(201);
    await as(ctx.app, user).delete(`/api/v1/transfers/${res.body.id}`).expect(204);
    expect(await balanceOf(ctx.app, user, galicia.id)).toBe('2000000.00');
    expect(await balanceOf(ctx.app, user, wallet.id)).toBe('0.00');
  });

  it('the database enforces exactly one destination', async () => {
    await expect(
      ctx.prisma.transfer.create({
        data: {
          userId: user.id,
          fromAccountId: galicia.id,
          amountOut: '1',
          amountIn: '1',
          currencyIn: 'ARS',
          date: new Date('2026-10-23'),
        },
      }),
    ).rejects.toThrow();
  });

  it('isolation: cannot transfer from or to accounts of another user', async () => {
    const other = await registerUser(ctx.app);
    const theirs = await createAccount(ctx.app, other, { initialBalance: '1000' });
    const api = as(ctx.app, user);
    await api
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: theirs.id, toAccountId: wallet.id, amountOut: '1000' }))
      .expect(404);
    await api
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: galicia.id, toAccountId: theirs.id, amountOut: '1000' }))
      .expect(404);
    const mine = await api
      .post('/api/v1/transfers')
      .send(transfer({ fromAccountId: galicia.id, toAccountId: wallet.id, amountOut: '1' }))
      .expect(201);
    await as(ctx.app, other).get(`/api/v1/transfers/${mine.body.id}`).expect(404);
    await as(ctx.app, other).delete(`/api/v1/transfers/${mine.body.id}`).expect(404);
    expect(await balanceOf(ctx.app, other, theirs.id)).toBe('1000.00');
  });
});
