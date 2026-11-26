import type { Account, InvestmentPocket, Investments, Pocket } from '@platin/contracts';
import { parseLocalDate } from '@platin/domain';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { ClockService } from '../common/clock.service';

/** Phase 42: term deposits with a calculated value and the month-end valuation (INV-11, 12). */
describe('term deposits and automatic valuations', () => {
  let ctx: TestContext;
  let user: TestUser;
  let broker: Account;
  let available: Pocket;
  let deposit: Pocket;

  const api = () => as(ctx.app, user);
  const setToday = (day: string) =>
    vi.spyOn(ctx.app.get(ClockService), 'today').mockReturnValue(parseLocalDate(day));
  const overview = async (): Promise<Investments> =>
    (await api().get('/api/v1/investments').expect(200)).body;
  const pocketOf = async (id: string): Promise<InvestmentPocket> =>
    (await api().get(`/api/v1/pockets/${id}/investment`).expect(200)).body;
  const terms = {
    principal: '1000000',
    tna: '0.30',
    startDate: '2026-11-01',
    endDate: '2026-12-01',
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    setToday('2026-11-16');
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    broker = await createAccount(ctx.app, user, {
      name: 'Banco',
      kind: 'BANK',
      initialBalance: '2000000',
    });
    available = broker.pockets[0];
    deposit = await addPocket(ctx.app, user, broker.id, {
      name: 'Plazo fijo',
      kind: 'INVESTMENT',
      instrument: 'TERM_DEPOSIT',
    });
    await api()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: available.id,
        toPocketId: deposit.id,
        amountOut: '1000000',
        date: '2026-11-01',
        intent: 'INVEST',
      })
      .expect(201);
    await api().put(`/api/v1/pockets/${deposit.id}/term-deposit`).send(terms).expect(200);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.app.close();
  });

  it('on 16/11 it is worth 1.012.328,77 with a yield of 12.328,77; it does not count as overdue', async () => {
    const data = await overview();
    const pocket = data.accounts[0].pockets[0];
    expect(pocket.pricing).toMatchObject({
      mode: 'TERM_DEPOSIT',
      marketValue: '1012328.77',
      liveYield: '12328.77',
      liveYieldRate: '0.0123',
      units: null,
      listing: null,
      termDeposit: {
        principal: '1000000.00',
        tna: '0.300000',
        startDate: '2026-11-01',
        endDate: '2026-12-01',
        matured: false,
        redeemed: false,
      },
    });
    // The balance does not move with the live value: no movement is created.
    expect(pocket.balance).toBe('1000000.00');
    expect(data.totals).toEqual([
      { currency: 'ARS', invested: '1000000.00', value: '1012328.77', yield: '12328.77' },
    ]);
    expect(data.base.byInstrument).toEqual([{ instrument: 'TERM_DEPOSIT', value: '1012328.77' }]);
    expect(data.overdue).toBe(false);
    expect(data.lastValuationDate).toBeNull();

    // Months later it still does not ask to be updated by hand.
    setToday('2027-03-01');
    expect((await overview()).overdue).toBe(false);
    expect((await api().get('/api/v1/dashboard').expect(200)).body.valuationsOverdue).toBe(false);
  });

  it('after the end date it stays at 1.024.657,53 and is "Vencido"', async () => {
    setToday('2026-12-05');
    const pocket = await pocketOf(deposit.id);
    expect(pocket.pricing.marketValue).toBe('1024657.53');
    expect(pocket.pricing.termDeposit).toMatchObject({ matured: true, redeemed: false });
  });

  it('the first sync of December values it on 30/11 (AUTO) with its yield; a second sync creates nothing', async () => {
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    const valuations = (await api().get(`/api/v1/pockets/${deposit.id}/valuations`).expect(200))
      .body.items;
    expect(valuations).toHaveLength(1);
    // 29 days: 1.000.000 × 0,30 × 29 ÷ 365.
    expect(valuations[0]).toMatchObject({
      date: '2026-11-30',
      value: '1023835.62',
      yield: '23835.62',
      source: 'AUTO',
    });
    expect(await balanceOf(ctx.app, user, deposit.id)).toBe('1023835.62');

    await api().post('/api/v1/sync').expect(200);
    expect(
      (await api().get(`/api/v1/pockets/${deposit.id}/valuations`).expect(200)).body.items,
    ).toHaveLength(1);

    // The yield is a movement like a manual valuation's; "Libre" does not count it.
    const feed = (await api().get(`/api/v1/movements?pocketId=${deposit.id}`).expect(200)).body;
    expect(feed.items[0]).toMatchObject({ type: 'YIELD', origin: 'VALUATION', amount: '23835.62' });
  });

  it('redeemed at maturity, the next month-end valuation records the rest of the interest', async () => {
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    setToday('2026-12-05');
    await api()
      .post('/api/v1/transfers')
      .send({
        fromPocketId: deposit.id,
        toPocketId: available.id,
        amountOut: '1024657.53',
        date: '2026-12-05',
        intent: 'REDEEM',
      })
      .expect(201);
    const redeemed = await pocketOf(deposit.id);
    expect(redeemed.pricing.marketValue).toBe('0.00');
    expect(redeemed.pricing.termDeposit).toMatchObject({ matured: false, redeemed: true });

    setToday('2027-01-02');
    await api().post('/api/v1/sync').expect(200);
    const valuations = (await api().get(`/api/v1/pockets/${deposit.id}/valuations`).expect(200))
      .body.items;
    expect(valuations[0]).toMatchObject({ date: '2026-12-31', value: '0.00', yield: '821.91' });
    expect(await balanceOf(ctx.app, user, deposit.id)).toBe('0.00');
    // 23.835,62 + 821,91 = 24.657,53, the whole interest.
    expect((await pocketOf(deposit.id)).summary.yield).toBe('24657.53');
  });

  it('a term deposit that starts in December is not valued on 30/11', async () => {
    await api()
      .put(`/api/v1/pockets/${deposit.id}/term-deposit`)
      .send({ ...terms, startDate: '2026-12-01', endDate: '2027-01-01' })
      .expect(200);
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    expect(
      (await api().get(`/api/v1/pockets/${deposit.id}/valuations`).expect(200)).body.items,
    ).toHaveLength(0);
  });

  it('manual investments keep asking to be updated, and are the only ones in "Valores cargados a mano"', async () => {
    const cedears = await addPocket(ctx.app, user, broker.id, {
      name: 'CEDEARs',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
    setToday('2026-12-01');
    await api().post('/api/v1/sync').expect(200);
    const data = await overview();
    const manual = data.accounts[0].pockets.find((p) => p.id === cedears.id);
    expect(manual?.pricing).toMatchObject({ mode: 'MANUAL', marketValue: '0.00' });
    // The automatic valuation of the term deposit is not the date of the manual ones.
    expect(data.lastValuationDate).toBeNull();
    setToday('2027-01-20');
    expect((await overview()).overdue).toBe(true);
  });

  it('validations: dates, type and kind', async () => {
    const bad = await api()
      .put(`/api/v1/pockets/${deposit.id}/term-deposit`)
      .send({ ...terms, endDate: '2026-11-01' })
      .expect(422);
    expect(bad.body.code).toBe('TERM_DEPOSIT_DATES');

    const cedears = await addPocket(ctx.app, user, broker.id, {
      name: 'CEDEARs',
      kind: 'INVESTMENT',
      instrument: 'CEDEAR',
    });
    const mismatch = await api()
      .put(`/api/v1/pockets/${cedears.id}/term-deposit`)
      .send(terms)
      .expect(422);
    expect(mismatch.body.code).toBe('INSTRUMENT_TYPE_MISMATCH');

    const savings = await addPocket(ctx.app, user, broker.id, { name: 'Viaje', kind: 'SAVINGS' });
    const notInvestment = await api()
      .put(`/api/v1/pockets/${savings.id}/term-deposit`)
      .send(terms)
      .expect(422);
    expect(notInvestment.body.code).toBe('NOT_AN_INVESTMENT');
    await api().get(`/api/v1/pockets/${savings.id}/investment`).expect(422);

    await api()
      .put(`/api/v1/pockets/${deposit.id}/term-deposit`)
      .send({ ...terms, tna: '-1' })
      .expect(400);
  });

  it('changing its type drops the terms: it goes back to being valued by hand', async () => {
    await api().patch(`/api/v1/pockets/${deposit.id}`).send({ instrument: 'OTHER' }).expect(200);
    const pocket = await pocketOf(deposit.id);
    expect(pocket.pricing).toMatchObject({ mode: 'MANUAL', termDeposit: null });
    expect(await ctx.prisma.termDeposit.count()).toBe(0);
  });

  it('isolation: another user gets 404 for the terms and the investment', async () => {
    const other = await registerUser(ctx.app);
    await as(ctx.app, other)
      .put(`/api/v1/pockets/${deposit.id}/term-deposit`)
      .send(terms)
      .expect(404);
    await as(ctx.app, other).get(`/api/v1/pockets/${deposit.id}/investment`).expect(404);
    // Their sync does not value someone else's term deposit.
    setToday('2026-12-01');
    await as(ctx.app, other).post('/api/v1/sync').expect(200);
    expect(await ctx.prisma.pocketValuation.count()).toBe(0);
    // Nor do they see it in their investments.
    const theirs = (await as(ctx.app, other).get('/api/v1/investments').expect(200)).body;
    expect(theirs.accounts).toEqual([]);
  });
});
