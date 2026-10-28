import type { Pocket, Category, Movement } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('movements', () => {
  let ctx: TestContext;
  let user: TestUser;
  let galicia: Pocket;
  let wallet: Pocket;
  let dollars: Pocket;
  let food: Category;
  let salary: Category;

  const api = () => as(ctx.app, user);
  const labels = (items: Movement[]) =>
    items.map((m) => (m.kind === 'TRANSACTION' ? m.description : `transfer:${m.description}`));

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '2000000' });
    wallet = await createPocket(ctx.app, user, { name: 'Mercado Pago' });
    dollars = await createPocket(ctx.app, user, { name: 'Caja USD', currency: 'USD' });
    food = await category(ctx.app, user, 'Supermercado');
    salary = await category(ctx.app, user, 'Sueldo');

    const tx = (body: Record<string, unknown>) =>
      api().post('/api/v1/transactions').send(body).expect(201);
    await tx({
      type: 'INCOME',
      pocketId: galicia.id,
      categoryId: salary.id,
      amount: '1850000',
      date: '2026-10-20',
      description: 'Sueldo',
    });
    await tx({
      type: 'EXPENSE',
      pocketId: wallet.id,
      categoryId: food.id,
      amount: '18500',
      date: '2026-10-23',
      description: 'Coto',
    });
    await tx({
      type: 'EXPENSE',
      pocketId: galicia.id,
      categoryId: food.id,
      amount: '9000',
      date: '2026-09-30',
      description: 'Dia',
    });
    await api()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: galicia.id,
        toPocketId: dollars.id,
        amountOut: '120000',
        amountIn: '100',
        date: '2026-10-23',
        description: 'Compra de dólares',
      })
      .expect(201);
    await ctx.prisma.transaction.create({
      data: {
        userId: user.id,
        pocketId: galicia.id,
        categoryId: food.id,
        type: 'EXPENSE',
        status: 'PENDING',
        origin: 'FIXED',
        amount: '4999',
        currency: 'ARS',
        rateToBase: '1',
        baseAmount: '4999',
        date: new Date('2026-10-22'),
        description: 'Spotify',
      },
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('lists movements and transfers together, newest first', async () => {
    const res = await api().get('/api/v1/movements').expect(200);
    expect(labels(res.body.items)).toEqual([
      'transfer:Compra de dólares',
      'Coto',
      'Spotify',
      'Sueldo',
      'Dia',
    ]);
    const purchase = res.body.items[0];
    expect(purchase).toMatchObject({
      kind: 'TRANSFER',
      amountOut: '120000.00',
      currencyOut: 'ARS',
      amountIn: '100.00',
      currencyIn: 'USD',
      impliedRate: '1200.000000',
      fromPocket: { name: 'Disponible', accountName: 'Galicia' },
      toPocket: { name: 'Caja USD', accountName: 'Caja USD' },
    });
    expect(res.body.items[1]).toMatchObject({
      kind: 'TRANSACTION',
      category: { name: 'Supermercado', icon: 'shopping-cart' },
      pocket: { name: 'Disponible', accountName: 'Mercado Pago', currency: 'ARS' },
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it('filters by period, type, account, category, status and text', async () => {
    const get = async (query: string) =>
      labels((await api().get(`/api/v1/movements?${query}`).expect(200)).body.items);
    expect(await get('period=2026-09')).toEqual(['Dia']);
    expect(await get('period=2026-10&type=EXPENSE')).toEqual(['Coto', 'Spotify']);
    expect(await get('type=INCOME')).toEqual(['Sueldo']);
    expect(await get('type=TRANSFER')).toEqual(['transfer:Compra de dólares']);
    expect(await get(`pocketId=${dollars.id}`)).toEqual(['transfer:Compra de dólares']);
    expect(await get(`categoryId=${food.id}`)).toEqual(['Coto', 'Spotify', 'Dia']);
    expect(await get('status=PENDING')).toEqual(['Spotify']);
    expect(await get('q=coto')).toEqual(['Coto']);
    expect(await get('q=supermer')).toEqual(['Coto', 'Spotify', 'Dia']);
  });

  it('paginates with a cursor without repeating or skipping', async () => {
    const first = await api().get('/api/v1/movements?limit=2').expect(200);
    expect(first.body.items).toHaveLength(2);
    const second = await api()
      .get(`/api/v1/movements?limit=2&cursor=${first.body.nextCursor}`)
      .expect(200);
    const third = await api()
      .get(`/api/v1/movements?limit=2&cursor=${second.body.nextCursor}`)
      .expect(200);
    expect(
      [...first.body.items, ...second.body.items, ...third.body.items].map((m) => m.id),
    ).toHaveLength(5);
    expect(labels([...first.body.items, ...second.body.items, ...third.body.items])).toEqual([
      'transfer:Compra de dólares',
      'Coto',
      'Spotify',
      'Sueldo',
      'Dia',
    ]);
    expect(third.body.nextCursor).toBeNull();
    await api().get('/api/v1/movements?cursor=not-a-cursor').expect(400);
  });

  it('summarizes confirmed income and expenses of a month; pending ones are only counted', async () => {
    const res = await api().get('/api/v1/movements/summary?period=2026-10').expect(200);
    expect(res.body).toEqual({
      period: '2026-10',
      currency: 'ARS',
      income: '1850000.00',
      expense: '18500.00',
      pendingCount: 1,
    });
  });

  it('isolation: another user sees an empty list', async () => {
    const other = await registerUser(ctx.app);
    const res = await as(ctx.app, other).get('/api/v1/movements').expect(200);
    expect(res.body.items).toEqual([]);
    const filtered = await as(ctx.app, other)
      .get(`/api/v1/movements?pocketId=${galicia.id}`)
      .expect(200);
    expect(filtered.body.items).toEqual([]);
    const summary = await as(ctx.app, other)
      .get('/api/v1/movements/summary?period=2026-10')
      .expect(200);
    expect(summary.body).toMatchObject({ income: '0.00', expense: '0.00', pendingCount: 0 });
  });
});
