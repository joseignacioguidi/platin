import type { Account, InvestmentPocket, Listing, Pocket } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { ClockService } from '../common/clock.service';
import { ArgentinaDatosProvider } from '../prices/argentinadatos.provider';
import { CoinGeckoProvider } from '../prices/coingecko.provider';
import { Data912Provider } from '../prices/data912.provider';

/**
 * Phase 44: CEDEARs and stocks (Data912) and crypto (CoinGecko), next to the funds. The real
 * providers run against a fake fetch keyed by host, so one source can fail alone.
 */
describe('CEDEARs, stocks and crypto with automatic prices', () => {
  let ctx: TestContext;
  let user: TestUser;
  let broker: Account;
  let pesos: Pocket;
  let dollars: Pocket;
  let today = '2026-11-25';
  const down = new Set<string>();
  let aaplPrice = '13000';

  const cedears = () =>
    JSON.stringify([
      { symbol: 'AAPL', c: Number(aaplPrice) },
      { symbol: 'AAPLD', c: 9.1 },
      { symbol: 'AAPLC', c: 9.05 },
      { symbol: 'KO', c: 0 },
    ]).replace(/"c":(\d+(\.\d+)?)/g, '"c":$1');
  const stocks = JSON.stringify([{ symbol: 'GGAL', c: 4747.5 }]);
  const fund = '[{"fondo":"Super Ahorro $ - Clase A","fecha":"2026-11-24","vcp":20615.519}]';

  const api = () => as(ctx.app, user);
  const setToday = (day: string, now = `${day}T15:00:00Z`) => {
    today = day;
    vi.spyOn(ctx.app.get(ClockService), 'today').mockReturnValue(parseLocalDate(day));
    vi.spyOn(ctx.app.get(ClockService), 'now').mockReturnValue(new Date(now));
  };
  const search = async (type: string, q: string): Promise<Listing[]> =>
    (await api().get('/api/v1/instruments').query({ type, q }).expect(200)).body.items;
  const find = async (type: string, q: string, symbol: string) =>
    (await search(type, q)).find((i) => i.symbol === symbol) as Listing;
  const link = (pocket: Pocket, instrumentId: string, initialUnits: string) =>
    api().put(`/api/v1/pockets/${pocket.id}/holding`).send({ instrumentId, initialUnits });
  const pocketOf = async (id: string): Promise<InvestmentPocket> =>
    (await api().get(`/api/v1/pockets/${id}/investment`).expect(200)).body;

  beforeAll(async () => {
    const day = () => parseLocalDate(today);
    ctx = await createTestApp(
      {},
      {
        priceProviders: [
          new ArgentinaDatosProvider('https://ad.test', day),
          new Data912Provider('https://d912.test', day),
          new CoinGeckoProvider('https://cg.test', day),
        ],
      },
    );
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (!url.hostname.endsWith('.test')) return realFetch(input, init);
      if (down.has(url.hostname)) throw new Error('connect ECONNREFUSED');
      const path = url.pathname + url.search;
      if (url.hostname === 'd912.test') {
        if (path === '/live/arg_cedears') return new Response(cedears());
        if (path === '/live/arg_stocks') return new Response(stocks);
        if (path === '/historical/cedears/AAPL') {
          return new Response('[{"date":"2026-11-27","c":13500.0},{"date":"2026-12-01","c":14000.0}]');
        }
        return new Response('{"Error":"Nahh no tengo ese ticker loko"}');
      }
      if (url.hostname === 'cg.test') {
        if (path.startsWith('/coins/markets')) {
          return new Response('[{"id":"bitcoin","symbol":"btc","name":"Bitcoin"},{"id":"tether","symbol":"usdt","name":"Tether"}]');
        }
        if (path.startsWith('/simple/price')) return new Response('{"bitcoin":{"usd":60858.42}}');
        if (path.startsWith('/coins/bitcoin/history')) {
          return new Response('{"market_data":{"current_price":{"usd":62000.5,"ars":90000000}}}');
        }
      }
      if (url.hostname === 'ad.test' && path.endsWith('/mercadoDinero/ultimo')) {
        return new Response(fund);
      }
      return new Response('[]');
    });
  });

  beforeEach(async () => {
    down.clear();
    aaplPrice = '13000';
    setToday('2026-11-25');
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    broker = await createAccount(ctx.app, user, {
      name: 'IOL',
      kind: 'BROKER',
      initialBalance: '1000000',
    });
    pesos = await addPocket(ctx.app, user, broker.id, {
      name: 'Apple',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
    dollars = await addPocket(ctx.app, user, broker.id, {
      name: 'Bitcoin',
      kind: 'INVESTMENT',
      instrument: 'CRYPTO',
      currency: 'USD',
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.app.close();
  });

  it('"AAPL" lists AAPL in pesos and AAPLD in dollars, each only for pockets of its currency', async () => {
    const found = await search('CEDEAR', 'AAPL');
    expect(found.map((i) => [i.symbol, i.currency])).toEqual([
      ['AAPL', 'ARS'],
      ['AAPLC', 'USD'],
      ['AAPLD', 'USD'],
    ]);
    const aapld = found.find((i) => i.symbol === 'AAPLD') as Listing;
    expect((await link(pesos, aapld.id, '1').expect(422)).body.code).toBe(
      'INSTRUMENT_CURRENCY_MISMATCH',
    );
    expect((await search('STOCK', 'ggal')).map((i) => i.symbol)).toEqual(['GGAL']);
  });

  it('20 AAPL at 13.000 are worth 260.000; invested 240.000 → live yield 20.000 (8,33 %)', async () => {
    await link(pesos, (await find('CEDEAR', 'AAPL', 'AAPL')).id, '0').expect(200);
    await api()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: broker.pockets[0].id,
        toPocketId: pesos.id,
        amountOut: '240000',
        units: '20',
        date: '2026-11-25',
      })
      .expect(201);
    expect((await pocketOf(pesos.id)).pricing).toMatchObject({
      units: '20.00000000',
      price: '13000.000000',
      marketValue: '260000.00',
      liveYield: '20000.00',
      liveYieldRate: '0.0833',
      stale: false,
    });
  });

  it('0,0015 BTC in a dollar pocket are worth their USD value with today’s price', async () => {
    await link(dollars, (await find('CRYPTO', 'bit', 'BTC')).id, '0.0015').expect(200);
    expect((await pocketOf(dollars.id)).pricing).toMatchObject({
      units: '0.00150000',
      price: '60858.420000',
      priceDate: '2026-11-25',
      // 0,0015 × 60.858,42 = 91,287… → 91,29.
      marketValue: '91.29',
      listing: { symbol: 'BTC', currency: 'USD' },
    });
  });

  it('with Data912 down, CEDEARs show "Precio al…" and funds and crypto keep updating', async () => {
    const fundPocket = await addPocket(ctx.app, user, broker.id, {
      name: 'Super Ahorro',
      kind: 'INVESTMENT',
      instrument: 'MUTUAL_FUND',
    });
    await link(pesos, (await find('CEDEAR', 'AAPL', 'AAPL')).id, '20').expect(200);
    await link(dollars, (await find('CRYPTO', 'bit', 'BTC')).id, '0.0015').expect(200);
    await link(fundPocket, (await find('MUTUAL_FUND', 'super', 'Super Ahorro $')).id, '150').expect(200);
    await api().get('/api/v1/investments').expect(200);

    // Two hours later Data912 fails: only the CEDEAR is stale.
    setToday('2026-11-25', '2026-11-25T17:30:00Z');
    down.add('d912.test');
    const data = (await api().get('/api/v1/investments').expect(200)).body;
    const byId = new Map<string, InvestmentPocket>(
      data.accounts[0].pockets.map((p: InvestmentPocket) => [p.id, p]),
    );
    expect(byId.get(pesos.id)?.pricing).toMatchObject({
      stale: true,
      priceDate: '2026-11-25',
      marketValue: '260000.00',
    });
    expect(byId.get(dollars.id)?.pricing.stale).toBe(false);
    expect(byId.get(fundPocket.id)?.pricing.stale).toBe(false);
  });

  it('a price that comes empty or zero leaves that instrument with its last price', async () => {
    await link(pesos, (await find('CEDEAR', 'AAPL', 'AAPL')).id, '20').expect(200);
    await pocketOf(pesos.id);
    setToday('2026-11-25', '2026-11-25T17:30:00Z');
    aaplPrice = '0';
    const pricing = (await pocketOf(pesos.id)).pricing;
    expect(pricing).toMatchObject({ price: '13000.000000', stale: true, marketValue: '260000.00' });
    // A ticker that never had a price links and shows its balance until one arrives.
    const ko = await addPocket(ctx.app, user, broker.id, {
      name: 'Coca',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
    const res = await link(ko, (await find('CEDEAR', 'KO', 'KO')).id, '5').expect(200);
    expect(res.body.pricing).toMatchObject({ price: null, stale: true, marketValue: '0.00' });
  });

  it('at the start of the month CEDEARs and crypto use the close of the last day of the previous one', async () => {
    await link(pesos, (await find('CEDEAR', 'AAPL', 'AAPL')).id, '20').expect(200);
    await link(dollars, (await find('CRYPTO', 'bit', 'BTC')).id, '0.0015').expect(200);
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    const of = async (id: string) =>
      (await api().get(`/api/v1/pockets/${id}/valuations`).expect(200)).body.items[0];
    // AAPL: no row on 30/11, the closest previous close is 27/11 (13.500).
    expect(await of(pesos.id)).toMatchObject({ date: '2026-11-30', value: '270000.00', source: 'AUTO' });
    // BTC: 0,0015 × 62.000,5 = 93,00.
    expect(await of(dollars.id)).toMatchObject({ date: '2026-11-30', value: '93.00', source: 'AUTO' });
  });
});
