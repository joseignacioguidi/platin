import type { Account, Investments, Pocket } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('investments', () => {
  let ctx: TestContext;
  let user: TestUser;
  let broker: Account;
  let available: Pocket;
  let cedears: Pocket;

  const api = () => as(ctx.app, user);
  const invest = (to: Pocket, amountOut: string, date = '2026-10-01') =>
    api()
      .post('/api/v1/transfers')
      .send({ fromPocketId: available.id, toPocketId: to.id, amountOut, date, intent: 'INVEST' })
      .expect(201);
  const value = (items: { pocketId: string; date: string; value: string }[]) =>
    api().post('/api/v1/investments/valuations').send({ items });
  const overview = async (): Promise<Investments> =>
    (await api().get('/api/v1/investments').expect(200)).body;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    broker = await createAccount(ctx.app, user, {
      name: 'Balanz',
      kind: 'BROKER',
      initialBalance: '2000000',
    });
    available = broker.pockets[0];
    cedears = await addPocket(ctx.app, user, broker.id, {
      name: 'CEDEARs',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('phase 11: invested 500.000, valued 540.000 → yield 40.000 (8 %), and "Libre" does not change', async () => {
    await invest(cedears, '500000');
    const before = (await api().get('/api/v1/dashboard').expect(200)).body;

    const res = await value([{ pocketId: cedears.id, date: '2026-10-20', value: '540000' }]).expect(
      201,
    );
    expect(res.body.items[0]).toMatchObject({ value: '540000.00', yield: '40000.00' });
    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('540000.00');

    const pocket = (await overview()).accounts[0].pockets[0];
    expect(pocket.summary).toEqual({
      invested: '500000.00',
      value: '540000.00',
      yield: '40000.00',
      yieldRate: '0.0800',
      lastYield: '40000.00',
    });

    const after = (await api().get('/api/v1/dashboard').expect(200)).body;
    expect(after.free).toBe(before.free);
    expect(after.expectedIncome).toBe(before.expectedIncome);
    const summary = (await api().get('/api/v1/movements/summary?period=2026-10').expect(200)).body;
    expect(summary.income).toBe('0.00');

    // The yield is a movement of the pocket with the Rendimientos category.
    const feed = (await api().get(`/api/v1/movements?pocketId=${cedears.id}`).expect(200)).body;
    const yields = await category(ctx.app, user, 'Rendimientos');
    expect(feed.items[0]).toMatchObject({
      kind: 'TRANSACTION',
      type: 'YIELD',
      origin: 'VALUATION',
      amount: '40000.00',
      category: { id: yields.id },
    });
  });

  it('records negative yields, and no movement when the value matches the balance', async () => {
    await invest(cedears, '500000');
    const loss = await value([
      { pocketId: cedears.id, date: '2026-10-10', value: '470000' },
    ]).expect(201);
    expect(loss.body.items[0].yield).toBe('-30000.00');
    const same = await value([
      { pocketId: cedears.id, date: '2026-10-20', value: '470000' },
    ]).expect(201);
    expect(same.body.items[0]).toMatchObject({ yield: '0.00', transactionId: null });
    expect((await overview()).accounts[0].pockets[0].summary).toMatchObject({
      yield: '-30000.00',
      yieldRate: '-0.0600',
      lastYield: '0.00',
    });
  });

  it('values the balance at the date of the valuation, not today', async () => {
    await invest(cedears, '500000', '2026-10-01');
    await invest(cedears, '100000', '2026-10-15');
    // On the 10th only the first 500.000 were there.
    const res = await value([{ pocketId: cedears.id, date: '2026-10-10', value: '520000' }]).expect(
      201,
    );
    expect(res.body.items[0].yield).toBe('20000.00');
    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('620000.00');
  });

  it('updates several investments in one go, all or nothing (INV-03)', async () => {
    const fund = await addPocket(ctx.app, user, broker.id, {
      name: 'FCI dólares',
      kind: 'INVESTMENT',
      instrument: 'MUTUAL_FUND',
      currency: 'USD',
      initialBalance: '1000',
    });
    await invest(cedears, '500000');
    const failed = await value([
      { pocketId: cedears.id, date: '2026-10-20', value: '540000' },
      { pocketId: available.id, date: '2026-10-20', value: '1' },
    ]).expect(422);
    expect(failed.body.code).toBe('NOT_AN_INVESTMENT');
    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('500000.00');

    await value([
      { pocketId: cedears.id, date: '2026-10-20', value: '540000' },
      { pocketId: fund.id, date: '2026-10-20', value: '1050' },
    ]).expect(201);
    const all = await overview();
    expect(all.totals).toEqual([
      { currency: 'ARS', invested: '500000.00', value: '540000.00', yield: '40000.00' },
      { currency: 'USD', invested: '1000.00', value: '1050.00', yield: '50.00' },
    ]);
    // In base currency with the fake MEP at 1200: 540.000 + 1050 × 1200.
    expect(all.base).toMatchObject({
      currency: 'ARS',
      value: '1800000.00',
      invested: '1700000.00',
    });
    expect(all.base.byInstrument).toEqual([
      { instrument: 'MUTUAL_FUND', value: '1260000.00' },
      { instrument: 'CEDEAR', value: '540000.00' },
    ]);
    expect(all.lastValuationDate).toBe('2026-10-20');
    expect(all.overdue).toBe(false);
  });

  it('one valuation per date, always after the last one, never in the future', async () => {
    await value([{ pocketId: cedears.id, date: '2026-10-20', value: '10' }]).expect(201);
    const same = await value([{ pocketId: cedears.id, date: '2026-10-20', value: '20' }]).expect(
      409,
    );
    expect(same.body.code).toBe('VALUATION_NOT_LATEST');
    await value([{ pocketId: cedears.id, date: '2026-10-19', value: '20' }]).expect(409);
    const future = await value([{ pocketId: cedears.id, date: '2026-10-24', value: '20' }]).expect(
      422,
    );
    expect(future.body.code).toBe('VALUATION_IN_FUTURE');
  });

  it('deleting the last valuation deletes its yield; earlier ones wait (INV-04)', async () => {
    await invest(cedears, '500000');
    const first = (
      await value([{ pocketId: cedears.id, date: '2026-10-10', value: '520000' }]).expect(201)
    ).body.items[0];
    const second = (
      await value([{ pocketId: cedears.id, date: '2026-10-20', value: '540000' }]).expect(201)
    ).body.items[0];

    const blocked = await api().delete(`/api/v1/valuations/${first.id}`).expect(409);
    expect(blocked.body.code).toBe('VALUATION_NOT_LATEST');
    // The yield itself can't be edited or deleted as a movement.
    const direct = await api().delete(`/api/v1/transactions/${second.transactionId}`).expect(422);
    expect(direct.body.code).toBe('YIELD_FROM_VALUATION');

    await api().delete(`/api/v1/valuations/${second.id}`).expect(204);
    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('520000.00');
    const history = (await api().get(`/api/v1/pockets/${cedears.id}/valuations`).expect(200)).body;
    expect(history.items.map((v: { date: string }) => v.date)).toEqual(['2026-10-10']);
    await api().delete(`/api/v1/valuations/${first.id}`).expect(204);
    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('500000.00');
  });

  it('the home suggests updating values after more than a month (INV-03)', async () => {
    await value([{ pocketId: cedears.id, date: '2026-09-20', value: '0' }]).expect(201);
    expect((await overview()).overdue).toBe(true);
    expect((await api().get('/api/v1/dashboard').expect(200)).body.valuationsOverdue).toBe(true);
    await value([{ pocketId: cedears.id, date: '2026-10-23', value: '0' }]).expect(201);
    expect((await api().get('/api/v1/dashboard').expect(200)).body.valuationsOverdue).toBe(false);
  });

  it('isolation: another user cannot see, value or undo my investments', async () => {
    await invest(cedears, '500000');
    const mine = (
      await value([{ pocketId: cedears.id, date: '2026-10-20', value: '540000' }]).expect(201)
    ).body.items[0];
    const other = await registerUser(ctx.app);
    const theirs = as(ctx.app, other);
    expect((await theirs.get('/api/v1/investments').expect(200)).body.accounts).toEqual([]);
    await theirs
      .post('/api/v1/investments/valuations')
      .send({ items: [{ pocketId: cedears.id, date: '2026-10-21', value: '1' }] })
      .expect(404);
    await theirs.get(`/api/v1/pockets/${cedears.id}/valuations`).expect(404);
    await theirs.delete(`/api/v1/valuations/${mine.id}`).expect(404);
    expect(await balanceOf(ctx.app, user, cedears.id)).toBe('540000.00');
  });
});
