import request from 'supertest';
import { createPocket } from '../../test/fixtures';
import { as, registerUser } from '../../test/auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { parseDolarApi } from './rate-provider';

describe('rates', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.rates.failing = false;
    ctx.rates.calls = 0;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const latest = async () => {
    const user = await registerUser(ctx.app);
    return (await as(ctx.app, user).get('/api/v1/rates/latest').expect(200)).body;
  };

  it('fetches the dollar types and the other currencies once and stores them for the day', async () => {
    const body = await latest();
    expect(body.stale).toBe(false);
    const day = '2026-10-23';
    expect(body.rates).toEqual(
      expect.arrayContaining([
        { currency: 'USD', type: 'MEP', buy: '1190.000000', sell: '1200.000000', date: day },
        { currency: 'USD', type: 'OFICIAL', buy: '1500.000000', sell: '1550.000000', date: day },
        { currency: 'USD', type: 'BLUE', buy: '1545.000000', sell: '1565.000000', date: day },
        { currency: 'EUR', type: 'OFICIAL', buy: '1600.000000', sell: '1680.000000', date: day },
        { currency: 'BRL', type: 'OFICIAL', buy: '270.000000', sell: '285.000000', date: day },
        { currency: 'CLP', type: 'OFICIAL', buy: '1.550000', sell: '1.650000', date: day },
        { currency: 'UYU', type: 'OFICIAL', buy: '36.000000', sell: '38.000000', date: day },
      ]),
    );
    expect(body.rates).toHaveLength(7);
    // Within the hour it doesn't ask again.
    await latest();
    expect(ctx.rates.calls).toBe(1);
  });

  it('when the source fails, uses the last stored rate and reports it as stale', async () => {
    await ctx.prisma.exchangeRate.create({
      data: {
        date: new Date('2026-10-20'),
        type: 'MEP',
        buy: '1180',
        sell: '1190',
        source: 'fake',
      },
    });
    ctx.rates.failing = true;
    const body = await latest();
    expect(body.stale).toBe(true);
    expect(body.rates).toEqual([
      { currency: 'USD', type: 'MEP', buy: '1180.000000', sell: '1190.000000', date: '2026-10-20' },
    ]);
  });

  it('a movement dated on a weekend takes the closest previous rate', async () => {
    await ctx.prisma.exchangeRate.createMany({
      data: [
        { date: new Date('2026-10-16'), type: 'MEP', buy: '1100', sell: '1110', source: 'fake' },
        { date: new Date('2026-10-19'), type: 'MEP', buy: '1150', sell: '1160', source: 'fake' },
      ],
    });
    const user = await registerUser(ctx.app);
    const api = as(ctx.app, user);
    const usd = await createPocket(ctx.app, user, { name: 'USD', currency: 'USD' });
    const category = (await api.get('/api/v1/categories').expect(200)).body.find(
      (c: { kind: string }) => c.kind === 'EXPENSE',
    );
    const saturday = await api
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: usd.id,
        categoryId: category.id,
        amount: '10',
        date: '2026-10-18',
      })
      .expect(201);
    expect(saturday.body.rateToBase).toBe('1110.000000');
  });

  it('is only available with a session', async () => {
    await request(ctx.app.getHttpServer()).get('/api/v1/rates/latest').expect(401);
  });
});

describe('parseDolarApi', () => {
  it('maps the houses and keeps amounts as strings (no floats)', () => {
    const body =
      '[{"moneda":"USD","casa":"oficial","compra":1500,"venta":1550.5},' +
      '{"moneda":"USD","casa":"blue","compra":1545.1,"venta":1565},' +
      '{"moneda":"USD","casa":"bolsa","compra":1557.4,"venta":1563.9},' +
      '{"moneda":"USD","casa":"cripto","compra":1,"venta":2}]';
    expect(parseDolarApi(body)).toEqual([
      { type: 'OFICIAL', buy: '1500', sell: '1550.5' },
      { type: 'BLUE', buy: '1545.1', sell: '1565' },
      { type: 'MEP', buy: '1557.4', sell: '1563.9' },
    ]);
  });

  it('rejects unexpected bodies', () => {
    expect(() => parseDolarApi('{}')).toThrow();
    expect(() => parseDolarApi('[]')).toThrow();
  });
});
