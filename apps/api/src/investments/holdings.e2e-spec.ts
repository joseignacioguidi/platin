import type { Account, InvestmentPocket, Listing, Pocket } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { ClockService } from '../common/clock.service';
import { ArgentinaDatosProvider } from '../prices/argentinadatos.provider';

/**
 * Phase 43: mutual funds with an automatic price. The real ArgentinaDatos provider runs against a
 * fake fetch, so the catalog, the prices and the history go through the whole stack.
 */
describe('linked investments (FCI)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let bank: Account;
  let available: Pocket;
  let fund: Pocket;
  let today = '2026-11-25';
  let sourceDown = false;
  const requests: string[] = [];

  const fundRow = (fondo: string, fecha: string, vcp: string) =>
    `{"fondo":"${fondo}","horizonte":"corto","fecha":"${fecha}","vcp":${vcp},"ccp":1,"patrimonio":1}`;
  const latestBody = () =>
    `[${[
      fundRow('Super Ahorro $ - Clase A', '2026-11-24', '20615.519'),
      fundRow('Super Ahorro $ - Clase B', '2026-11-24', '25128.158'),
      fundRow('Super Ahorro U$S - Clase A ex Letes', '2026-11-24', '41.046'),
      fundRow('Superfondo 2000', '2020-09-07', '2.16'),
    ].join(',')}]`;

  const api = () => as(ctx.app, user);
  const setToday = (day: string) => {
    today = day;
    vi.spyOn(ctx.app.get(ClockService), 'today').mockReturnValue(parseLocalDate(day));
  };
  const search = async (q: string): Promise<Listing[]> =>
    (await api().get('/api/v1/instruments').query({ type: 'MUTUAL_FUND', q }).expect(200)).body
      .items;
  const classA = async () =>
    (await search('super ahorro $')).find((i) => i.name === 'Super Ahorro $ - Clase A') as Listing;
  const link = (pocket: Pocket, instrumentId: string, initialUnits: string) =>
    api().put(`/api/v1/pockets/${pocket.id}/holding`).send({ instrumentId, initialUnits });
  const transfer = (body: Record<string, string>) =>
    api()
      .post('/api/v1/transfers')
      .send({ date: '2026-11-25', ...body });
  const pocketOf = async (id: string): Promise<InvestmentPocket> =>
    (await api().get(`/api/v1/pockets/${id}/investment`).expect(200)).body;

  beforeAll(async () => {
    ctx = await createTestApp(
      {},
      {
        priceProviders: [
          new ArgentinaDatosProvider('https://ad.test', () => parseLocalDate(today)),
        ],
      },
    );
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://ad.test')) return realFetch(input, init);
      requests.push(url);
      if (sourceDown) throw new Error('connect ECONNREFUSED');
      if (url.endsWith('/mercadoDinero/ultimo')) return new Response(latestBody());
      if (url.endsWith('/mercadoDinero/2026/11/30')) {
        return new Response(`[${fundRow('Super Ahorro $ - Clase A', '2026-11-30', '20900')}]`);
      }
      if (/\/ultimo$/.test(url)) return new Response('[]');
      return new Response('[]');
    });
  });

  beforeEach(async () => {
    sourceDown = false;
    requests.length = 0;
    setToday('2026-11-25');
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    bank = await createAccount(ctx.app, user, {
      name: 'Santander',
      kind: 'BANK',
      initialBalance: '5000000',
    });
    available = bank.pockets[0];
    fund = await addPocket(ctx.app, user, bank.id, {
      name: 'Super Ahorro',
      kind: 'INVESTMENT',
      instrument: 'MUTUAL_FUND',
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.app.close();
  });

  it('searching "super ahorro" lists its classes with their currency, not the closed funds', async () => {
    const found = await search('super ahorro');
    expect(found.map((i) => [i.name, i.currency])).toEqual(
      expect.arrayContaining([
        ['Super Ahorro $ - Clase A', 'ARS'],
        ['Super Ahorro $ - Clase B', 'ARS'],
        ['Super Ahorro U$S - Clase A ex Letes', 'USD'],
      ]),
    );
    expect((await search('superfondo 2000')).length).toBe(0);
    // Without accents or case either way.
    expect((await search('SÚPER AHORRO')).length).toBe(3);
    const types = (
      await api().get('/api/v1/instruments').query({ type: 'CEDEAR', q: 'AAPL' }).expect(200)
    ).body;
    expect(types).toEqual({ items: [], priced: false });
  });

  it('linked with 150 units it shows units × unit value without loading anything', async () => {
    const instrument = await classA();
    const res = await link(fund, instrument.id, '150').expect(200);
    expect(res.body.pricing).toMatchObject({
      mode: 'MARKET',
      units: '150.00000000',
      price: '20615.519000',
      priceDate: '2026-11-24',
      stale: false,
      marketValue: '3092327.85',
      listing: { name: 'Super Ahorro $ - Clase A', symbol: 'Super Ahorro $', currency: 'ARS' },
    });
    const overview = (await api().get('/api/v1/investments').expect(200)).body;
    expect(overview.totals[0].value).toBe('3092327.85');
    expect(overview.overdue).toBe(false);
  });

  it('a fund in dollars does not link to a peso pocket; nor a fund to a CEDEAR pocket', async () => {
    const dollars = (await search('u$s'))[0];
    const res = await link(fund, dollars.id, '10').expect(422);
    expect(res.body.code).toBe('INSTRUMENT_CURRENCY_MISMATCH');
    const cedears = await addPocket(ctx.app, user, bank.id, {
      name: 'CEDEARs',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
    expect((await link(cedears, (await classA()).id, '1').expect(422)).body.code).toBe(
      'INSTRUMENT_TYPE_MISMATCH',
    );
  });

  it('investing with units, and never selling more units than there are', async () => {
    await link(fund, (await classA()).id, '150').expect(200);
    const missing = await transfer({
      fromPocketId: available.id,
      toPocketId: fund.id,
      amountOut: '500000',
    }).expect(422);
    expect(missing.body.code).toBe('UNITS_REQUIRED');

    const invested = await transfer({
      fromPocketId: available.id,
      toPocketId: fund.id,
      amountOut: '500000',
      units: '24.25357324',
    }).expect(201);
    expect(invested.body.units).toBe('24.25357324');
    expect((await pocketOf(fund.id)).pricing.units).toBe('174.25357324');

    const tooMuch = await transfer({
      fromPocketId: fund.id,
      toPocketId: available.id,
      amountOut: '4000000',
      units: '200',
    }).expect(422);
    expect(tooMuch.body.code).toBe('HOLDING_UNITS_NEGATIVE');

    await transfer({
      fromPocketId: fund.id,
      toPocketId: available.id,
      amountOut: '3592327.85',
      units: '174.25357324',
    }).expect(201);
    expect((await pocketOf(fund.id)).pricing).toMatchObject({
      units: '0.00000000',
      marketValue: '0.00',
    });

    // Units only go with a linked investment.
    const savings = await addPocket(ctx.app, user, bank.id, { name: 'Viaje', kind: 'SAVINGS' });
    const notLinked = await transfer({
      fromPocketId: available.id,
      toPocketId: savings.id,
      amountOut: '1000',
      units: '1',
    }).expect(422);
    expect(notLinked.body.code).toBe('UNITS_NOT_LINKED');
  });

  it('deleting a purchase that was already sold is refused', async () => {
    await link(fund, (await classA()).id, '0').expect(200);
    const buy = await transfer({
      fromPocketId: available.id,
      toPocketId: fund.id,
      amountOut: '100000',
      units: '4.85',
    }).expect(201);
    await transfer({
      fromPocketId: fund.id,
      toPocketId: available.id,
      amountOut: '100000',
      units: '4.85',
    }).expect(201);
    const res = await api().delete(`/api/v1/transfers/${buy.body.id}`).expect(422);
    expect(res.body.code).toBe('HOLDING_UNITS_NEGATIVE');
  });

  it('"Corregir cantidad" adds or subtracts units without money movements', async () => {
    await link(fund, (await classA()).id, '150').expect(200);
    const before = await balanceOf(ctx.app, user, fund.id);
    const added = await api()
      .post(`/api/v1/pockets/${fund.id}/holding/adjustments`)
      .send({ date: '2026-11-25', units: '0.5', direction: 'IN', note: 'Diferencia con el banco' })
      .expect(201);
    expect(added.body).toMatchObject({ units: '0.50000000', direction: 'IN' });
    expect((await pocketOf(fund.id)).pricing.units).toBe('150.50000000');
    expect(await balanceOf(ctx.app, user, fund.id)).toBe(before);
    const movements = (await api().get(`/api/v1/movements?pocketId=${fund.id}`).expect(200)).body;
    expect(movements.items).toHaveLength(0);

    const tooMuch = await api()
      .post(`/api/v1/pockets/${fund.id}/holding/adjustments`)
      .send({ date: '2026-11-25', units: '151', direction: 'OUT' })
      .expect(422);
    expect(tooMuch.body.code).toBe('HOLDING_UNITS_NEGATIVE');

    const list = (await api().get(`/api/v1/pockets/${fund.id}/holding/adjustments`).expect(200))
      .body.items;
    expect(list).toHaveLength(1);
    await api().delete(`/api/v1/holding-adjustments/${list[0].id}`).expect(204);
    expect((await pocketOf(fund.id)).pricing.units).toBe('150.00000000');
  });

  it('with ArgentinaDatos down it shows the last stored price with its date', async () => {
    await link(fund, (await classA()).id, '150').expect(200);
    sourceDown = true;
    // The next day the stored price is old: it is asked again and the source fails.
    vi.spyOn(ctx.app.get(ClockService), 'now').mockReturnValue(new Date('2026-11-27T15:00:00Z'));
    setToday('2026-11-27');
    const pricing = (await pocketOf(fund.id)).pricing;
    expect(pricing).toMatchObject({
      stale: true,
      price: '20615.519000',
      priceDate: '2026-11-24',
      marketValue: '3092327.85',
    });
    const overview = (await api().get('/api/v1/investments').expect(200)).body;
    expect(overview.totals[0].value).toBe('3092327.85');
  });

  it('at the start of the month it values with the unit value of the last day of the previous one', async () => {
    await link(fund, (await classA()).id, '150').expect(200);
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    const valuations = (await api().get(`/api/v1/pockets/${fund.id}/valuations`).expect(200)).body
      .items;
    // 150 × 20.900 (the value of 30/11 from the history).
    expect(valuations[0]).toMatchObject({
      date: '2026-11-30',
      value: '3135000.00',
      source: 'AUTO',
    });
    expect(requests).toContain('https://ad.test/v1/finanzas/fci/mercadoDinero/2026/11/30');
    expect(await balanceOf(ctx.app, user, fund.id)).toBe('3135000.00');
  });

  it('"Pasar a manual" keeps the history and goes back to being valued by hand', async () => {
    await link(fund, (await classA()).id, '150').expect(200);
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    const res = await api().delete(`/api/v1/pockets/${fund.id}/holding`).expect(200);
    expect(res.body.pricing).toMatchObject({ mode: 'MANUAL', units: null, listing: null });
    expect(res.body.lastValuation).toMatchObject({ date: '2026-11-30', source: 'AUTO' });
    expect(await balanceOf(ctx.app, user, fund.id)).toBe('3135000.00');
  });

  it('isolation: another user cannot link, correct, read or transfer units of my investment', async () => {
    const instrument = await classA();
    await link(fund, instrument.id, '150').expect(200);
    const other = await registerUser(ctx.app);
    const them = () => as(ctx.app, other);
    await them()
      .put(`/api/v1/pockets/${fund.id}/holding`)
      .send({ instrumentId: instrument.id, initialUnits: '1' })
      .expect(404);
    await them().delete(`/api/v1/pockets/${fund.id}/holding`).expect(404);
    await them()
      .post(`/api/v1/pockets/${fund.id}/holding/adjustments`)
      .send({ date: '2026-11-25', units: '1', direction: 'IN' })
      .expect(404);
    await them().get(`/api/v1/pockets/${fund.id}/holding/adjustments`).expect(404);
    const mine = await api()
      .post(`/api/v1/pockets/${fund.id}/holding/adjustments`)
      .send({ date: '2026-11-25', units: '1', direction: 'IN' })
      .expect(201);
    await them().delete(`/api/v1/holding-adjustments/${mine.body.id}`).expect(404);
    const theirAccount = await createAccount(ctx.app, other, { name: 'Otro', kind: 'BANK' });
    await them()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: theirAccount.pockets[0].id,
        toPocketId: fund.id,
        amountOut: '1000',
        units: '1',
        date: '2026-11-25',
      })
      .expect(404);
    expect((await pocketOf(fund.id)).pricing.units).toBe('151.00000000');
  });
});
