import type { Card, Category, Charge, Pocket, StatementSummary } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/**
 * TAR-03: between a statement's closing and its due date, a started purchase can start in that
 * statement instead of the open one. Visa closes on the 26 and is due on the 5; today is 2/11.
 */
describe('cards: installment in the statement still to be paid', () => {
  let ctx: TestContext;
  let user: TestUser;
  let visa: Card;
  let galicia: Pocket;
  let tech: Category;

  const api = () => as(ctx.app, user);
  const body = (extra: Record<string, unknown>) => ({
    categoryId: tech.id,
    currency: 'ARS',
    description: 'Heladera',
    date: '2026-11-02',
    ...extra,
  });
  const create = (extra: Record<string, unknown>) =>
    api().post(`/api/v1/cards/${visa.id}/charges`).send(body(extra));
  const periods = (c: Charge) => c.installments.map((i) => `${i.number}:${i.period}`);
  const statementOf = async (period: string): Promise<StatementSummary> => {
    const list: StatementSummary[] = (
      await api().get(`/api/v1/cards/${visa.id}/statements?from=2026-09&to=2027-06`).expect(200)
    ).body;
    const found = list.find((s) => s.period === period);
    if (!found) throw new Error(`No statement ${period}`);
    return found;
  };
  const refreshCard = async (): Promise<Card> =>
    (await api().get(`/api/v1/cards/${visa.id}`).expect(200)).body;
  const started = {
    totalAmount: '30555.44',
    installmentsCount: 9,
    startInstallment: 3,
    startStatement: 'PREVIOUS',
  };

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-11-02' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '2000000' });
    tech = await category(ctx.app, user, 'Otros gastos');
    visa = (
      await api()
        .post('/api/v1/cards')
        .send({ name: 'Visa Galicia', creditLimit: '2000000', closingDay: 26, dueDay: 5 })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('exposes the previous statement inside the window', async () => {
    expect((await refreshCard()).previousStatement).toEqual({
      period: '2026-10',
      closingDate: '2026-10-26',
      dueDate: '2026-11-05',
    });
  });

  it('"voy por la 3 de 9" in the previous statement: 3 in October, 4 in November, 9 in April', async () => {
    const charge = (await create(started).expect(201)).body as Charge;
    expect(periods(charge)).toEqual([
      '3:2026-10',
      '4:2026-11',
      '5:2026-12',
      '6:2027-01',
      '7:2027-02',
      '8:2027-03',
      '9:2027-04',
    ]);

    // Compromisos of November includes the installment of the statement due on 11/5.
    const months = (await api().get('/api/v1/commitments?months=3').expect(200)).body.months;
    const november = months.find((m: { period: string }) => m.period === '2026-11');
    const item = november.items.find(
      (i: { type: string; date: string }) => i.type === 'STATEMENT' && i.date === '2026-11-05',
    );
    expect(item.installments).toEqual([
      expect.objectContaining({ description: 'Heladera', number: 3, amount: '3395.05' }),
    ]);

    // The statement can be closed with the bank total and paid.
    const october = await statementOf('2026-10');
    await api()
      .post(`/api/v1/statements/${october.id}/close`)
      .send({ bankTotalArs: october.totals.ARS })
      .expect(200);
    const paid = await api()
      .post(`/api/v1/statements/${october.id}/payments`)
      .send({
        pocketId: galicia.id,
        currency: 'ARS',
        amount: october.totals.ARS,
        date: '2026-11-02',
      })
      .expect(201);
    expect(paid.body.status).toBe('PAID');
  });

  it('the default keeps the plan in the open statement', async () => {
    const charge = (await create({ ...started, startStatement: undefined }).expect(201))
      .body as Charge;
    expect(periods(charge)[0]).toBe('3:2026-11');
  });

  it('a new one-payment purchase still falls by its date', async () => {
    const charge = (await create({ totalAmount: '1000', date: '2026-10-20' }).expect(201))
      .body as Charge;
    expect(periods(charge)).toEqual(['1:2026-10']);
  });

  it('moves a plan from "4 of 9" in the open statement to "3 of 9" in the previous one', async () => {
    const charge = (
      await create({ ...started, startInstallment: 4, startStatement: undefined }).expect(201)
    ).body as Charge;
    expect(periods(charge)[0]).toBe('4:2026-11');
    const moved = (
      await api()
        .patch(`/api/v1/charges/${charge.id}`)
        .send({ startStatement: 'PREVIOUS' })
        .expect(200)
    ).body as Charge;
    expect(periods(moved)[0]).toBe('4:2026-10');
    expect(moved.installments).toHaveLength(6);
    const back = (
      await api().patch(`/api/v1/charges/${charge.id}`).send({ startStatement: 'OPEN' }).expect(200)
    ).body as Charge;
    expect(periods(back)[0]).toBe('4:2026-11');
  });

  it('a later edit keeps the plan where it is', async () => {
    const charge = (await create(started).expect(201)).body as Charge;
    const edited = (
      await api().patch(`/api/v1/charges/${charge.id}`).send({ totalAmount: '40000' }).expect(200)
    ).body as Charge;
    expect(periods(edited)[0]).toBe('3:2026-10');
    expect(edited.totalAmount).toBe('40000.00');
  });

  it('rejects the previous statement when it is closed in platin', async () => {
    await create(started).expect(201);
    const october = await statementOf('2026-10');
    await api()
      .post(`/api/v1/statements/${october.id}/close`)
      .send({ bankTotalArs: october.totals.ARS })
      .expect(200);
    const res = await create({ ...started, totalAmount: '1000' }).expect(422);
    expect(res.body.code).toBe('PREVIOUS_STATEMENT_NOT_AVAILABLE');
    expect((await refreshCard()).previousStatement).toBeNull();
  });

  it('rejects it for a purchase that is not started', async () => {
    await create({ totalAmount: '1000', startStatement: 'PREVIOUS' }).expect(400);
  });
});

describe('cards: previous statement outside the window', () => {
  let ctx: TestContext;
  let user: TestUser;
  let visa: Card;
  let tech: Category;

  const request = (extra: Record<string, unknown> = {}) => ({
    categoryId: tech.id,
    currency: 'ARS',
    description: 'X',
    date: '2026-11-06',
    totalAmount: '1000',
    installmentsCount: 3,
    startInstallment: 2,
    ...extra,
  });

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-11-06' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    tech = await category(ctx.app, user, 'Otros gastos');
    visa = (
      await as(ctx.app, user)
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 26, dueDay: 5 })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('after the due date there is no question and the request fails', async () => {
    const api = as(ctx.app, user);
    const card = (await api.get(`/api/v1/cards/${visa.id}`).expect(200)).body as Card;
    expect(card.previousStatement).toBeNull();
    const res = await api
      .post(`/api/v1/cards/${visa.id}/charges`)
      .send(request({ startStatement: 'PREVIOUS' }))
      .expect(422);
    expect(res.body.code).toBe('PREVIOUS_STATEMENT_NOT_AVAILABLE');
  });

  it('isolation: another user cannot move my plan or see my previous statement', async () => {
    const api = as(ctx.app, user);
    const other = as(ctx.app, await registerUser(ctx.app));
    const charge = (await api.post(`/api/v1/cards/${visa.id}/charges`).send(request()).expect(201))
      .body as Charge;
    await other.patch(`/api/v1/charges/${charge.id}`).send({ startStatement: 'OPEN' }).expect(404);
    await other.get(`/api/v1/cards/${visa.id}`).expect(404);
  });
});
