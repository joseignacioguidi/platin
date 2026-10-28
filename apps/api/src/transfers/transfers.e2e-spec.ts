import type { Pocket } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('transfers', () => {
  let ctx: TestContext;
  let user: TestUser;
  let galicia: Pocket;
  let wallet: Pocket;
  let dollars: Pocket;

  const transfer = (overrides: Record<string, unknown>) => ({ date: '2026-10-23', ...overrides });

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createPocket(ctx.app, user, {
      name: 'Galicia',
      initialBalance: '2000000',
    });
    wallet = await createPocket(ctx.app, user, { name: 'Mercado Pago' });
    dollars = await createPocket(ctx.app, user, {
      name: 'Caja USD',
      kind: 'SAVINGS',
      currency: 'USD',
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('moves money between accounts of the same currency', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: galicia.id, toPocketId: wallet.id, amountOut: '50000' }))
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
          fromPocketId: galicia.id,
          toPocketId: dollars.id,
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
          fromPocketId: dollars.id,
          toPocketId: galicia.id,
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
      .send(transfer({ fromPocketId: galicia.id, toPocketId: dollars.id, amountOut: '1000' }))
      .expect(422);
    expect(missing.body.code).toBe('TRANSFER_AMOUNT_IN_REQUIRED');
    const differ = await api
      .post('/api/v1/transfers')
      .send(
        transfer({
          fromPocketId: galicia.id,
          toPocketId: wallet.id,
          amountOut: '1000',
          amountIn: '999',
        }),
      )
      .expect(422);
    expect(differ.body.code).toBe('TRANSFER_AMOUNTS_DIFFER');
    await api
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: galicia.id, toPocketId: galicia.id, amountOut: '1' }))
      .expect(400);
  });

  it('names the transfer by its pockets and checks the quick actions (CTA-05, INV-02)', async () => {
    const cedears = await addPocket(ctx.app, user, galicia.accountId, {
      name: 'CEDEARs',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
    const api = as(ctx.app, user);
    const invested = await api
      .post('/api/v1/transfers')
      .send(
        transfer({
          fromPocketId: galicia.id,
          toPocketId: cedears.id,
          amountOut: '500000',
          intent: 'INVEST',
        }),
      )
      .expect(201);
    expect(invested.body.intent).toBe('INVEST');
    const redeemed = await api
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: cedears.id, toPocketId: galicia.id, amountOut: '100000' }))
      .expect(201);
    expect(redeemed.body.intent).toBe('REDEEM');
    const moved = await api
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: galicia.id, toPocketId: wallet.id, amountOut: '1' }))
      .expect(201);
    expect(moved.body.intent).toBe('MOVE');

    // "Apartar" into an investment doesn't fit: the destination must be a savings pocket.
    const mismatch = await api
      .post('/api/v1/transfers')
      .send(
        transfer({
          fromPocketId: galicia.id,
          toPocketId: cedears.id,
          amountOut: '1',
          intent: 'SAVE',
        }),
      )
      .expect(422);
    expect(mismatch.body.code).toBe('TRANSFER_INTENT_MISMATCH');

    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('400000.00');
    const feed = await api.get(`/api/v1/movements?pocketId=${cedears.id}`).expect(200);
    expect(feed.body.items.map((m: { intent: string }) => m.intent)).toEqual(['REDEEM', 'INVEST']);
  });

  it('deletes a transfer and restores both balances', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: galicia.id, toPocketId: wallet.id, amountOut: '50000' }))
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
          fromPocketId: galicia.id,
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
    const theirs = await createPocket(ctx.app, other, { initialBalance: '1000' });
    const api = as(ctx.app, user);
    await api
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: theirs.id, toPocketId: wallet.id, amountOut: '1000' }))
      .expect(404);
    await api
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: galicia.id, toPocketId: theirs.id, amountOut: '1000' }))
      .expect(404);
    const mine = await api
      .post('/api/v1/transfers')
      .send(transfer({ fromPocketId: galicia.id, toPocketId: wallet.id, amountOut: '1' }))
      .expect(201);
    await as(ctx.app, other).get(`/api/v1/transfers/${mine.body.id}`).expect(404);
    await as(ctx.app, other).delete(`/api/v1/transfers/${mine.body.id}`).expect(404);
    expect(await balanceOf(ctx.app, other, theirs.id)).toBe('1000.00');
  });
});
