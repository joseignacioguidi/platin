import type { Pocket } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

interface Month {
  period: string;
  committed: { byCurrency: { currency: string; amount: string }[]; base: string };
  expectedIncome: { base: string };
  items: { type: string; name?: string; description?: string; amount: string }[];
}

/**
 * COM-01/02 and DAS-05: Compromisos and the home screen use one rule, so a month shows the same
 * committed amount in both (MOV-08 scheduled movements included).
 */
describe('commitments', () => {
  let ctx: TestContext;
  let user: TestUser;
  let galicia: Pocket;
  const api = () => as(ctx.app, user);
  const months = async (): Promise<Month[]> =>
    (await api().get('/api/v1/commitments?months=3').expect(200)).body.months;
  const dashboard = async (period: string) =>
    (await api().get(`/api/v1/dashboard?period=${period}`).expect(200)).body;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-11-01' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '1000000' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function visa() {
    return (
      await api()
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 20, dueDay: 5 })
        .expect(201)
    ).body as { id: string };
  }

  it('a USD 9,99 fixed on a card is committed in the next months', async () => {
    const card = await visa();
    const streaming = await category(ctx.app, user, 'Suscripciones');
    await api()
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Netflix',
        categoryId: streaming.id,
        cardId: card.id,
        amount: '9.99',
        currency: 'USD',
        dayOfMonth: 10,
        startPeriod: '2026-11',
      })
      .expect(201);
    await api().post('/api/v1/sync').expect(200);

    const [, december, january] = await months();
    for (const month of [december, january]) {
      expect(month.committed.byCurrency).toContainEqual({ currency: 'USD', amount: '9.99' });
    }
  });

  it('COM-04: each line says where it is paid from, and Compromisos has a margin', async () => {
    const card = await visa();
    const other = await category(ctx.app, user, 'Otros gastos');
    const rent = await category(ctx.app, user, 'Alquiler');
    await api()
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Notebook',
        categoryId: other.id,
        totalAmount: '300000',
        currency: 'ARS',
        date: '2026-11-01',
      })
      .expect(201);
    await api()
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: rent.id,
        pocketId: galicia.id,
        amount: '380000',
        dayOfMonth: 28,
        startPeriod: '2026-12',
      })
      .expect(201);

    const line = async () =>
      (await months())[1].items.find((i) => i.type === 'STATEMENT') as unknown as {
        cardId: string;
        payFrom: unknown;
      };
    // A card without a payment account: "Sin cuenta asignada".
    expect(await line()).toMatchObject({ cardId: card.id, payFrom: null });

    await api()
      .patch(`/api/v1/cards/${card.id}`)
      .send({ defaultPaymentPocketId: galicia.id })
      .expect(200);
    expect((await line()).payFrom).toEqual({
      pocketId: galicia.id,
      accountName: 'Galicia',
      pocketName: 'Disponible',
    });
    const december = (await months())[1];
    expect(december.items.find((i) => i.type === 'FIXED')).toMatchObject({
      payFrom: { pocketId: galicia.id, accountName: 'Galicia' },
    });
    expect(december).toMatchObject({ margin: '-680000.00' });
  });

  it('a statement of $ 300.000 with $ 100.000 paid commits $ 200.000 in both screens', async () => {
    const card = await visa();
    const tech = await category(ctx.app, user, 'Otros gastos');
    await api()
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Notebook',
        categoryId: tech.id,
        totalAmount: '300000',
        currency: 'ARS',
        date: '2026-10-10',
      })
      .expect(201);
    const statements = (await api().get(`/api/v1/cards/${card.id}/statements`).expect(200)).body;
    const october = (statements.items ?? statements).find(
      (s: { period: string }) => s.period === '2026-10',
    );
    await api().post(`/api/v1/statements/${october.id}/close`).send({}).expect(200);
    await api()
      .post(`/api/v1/statements/${october.id}/payments`)
      .send({ pocketId: galicia.id, currency: 'ARS', amount: '100000', date: '2026-11-01' })
      .expect(201);

    const [november] = await months();
    expect(november.committed.base).toBe('200000.00');
    expect((await dashboard('2026-11')).toPay).toBe('200000.00');
  });

  it('the committed of a month is the same in Compromisos and in the home screen', async () => {
    const card = await visa();
    const tech = await category(ctx.app, user, 'Otros gastos');
    const rent = await category(ctx.app, user, 'Alquiler');
    await api()
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Heladera',
        categoryId: tech.id,
        totalAmount: '120000',
        currency: 'ARS',
        date: '2026-10-10',
        installmentsCount: 3,
      })
      .expect(201);
    await api()
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: rent.id,
        pocketId: galicia.id,
        amount: '380000',
        dayOfMonth: 10,
        startPeriod: '2026-11',
      })
      .expect(201);
    await api().post('/api/v1/sync').expect(200);

    const [november] = await months();
    expect(november.committed.base).toBe('420000.00');
    expect((await dashboard('2026-11')).toPay).toBe(november.committed.base);
  });

  describe('scheduled movements (MOV-08)', () => {
    let health: { id: string };
    const turno = () =>
      api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: galicia.id,
          categoryId: health.id,
          amount: '45000',
          date: '2026-11-20',
          description: 'Turno médico',
        })
        .expect(201);
    const balance = async () =>
      (await api().get(`/api/v1/pockets/${galicia.id}`).expect(200)).body.balance;

    beforeEach(async () => {
      health = await category(ctx.app, user, 'Salud');
    });

    it('a future expense is scheduled: pending, without touching the balance', async () => {
      const res = await turno();
      expect(res.body).toMatchObject({
        status: 'PENDING',
        origin: 'SCHEDULED',
        amount: '45000.00',
      });
      expect(await balance()).toBe('1000000.00');

      const [november] = await months();
      expect(november.committed.base).toBe('45000.00');
      expect(november.items).toEqual([
        expect.objectContaining({
          type: 'SCHEDULED',
          description: 'Turno médico',
          category: expect.objectContaining({ name: 'Salud' }),
          payFrom: expect.objectContaining({ pocketId: galicia.id, accountName: 'Galicia' }),
        }),
      ]);
      const home = await dashboard('2026-11');
      expect(home).toMatchObject({
        inAccounts: '1000000.00',
        toPay: '45000.00',
        free: '955000.00',
        pending: { count: 0 },
      });
      expect(home.upcoming).toEqual([
        expect.objectContaining({ type: 'SCHEDULED', date: '2026-11-20', kind: 'EXPENSE' }),
      ]);
      // "Para confirmar" waits for its date.
      const due = await api().get('/api/v1/movements?status=PENDING&until=2026-11-01').expect(200);
      expect(due.body.items).toEqual([]);
    });

    it('can be edited and deleted before its date', async () => {
      const { body } = await turno();
      await api()
        .patch(`/api/v1/transactions/${body.id}`)
        .send({ amount: '50000', date: '2026-11-21' })
        .expect(200);
      expect((await months())[0].committed.base).toBe('50000.00');
      await api().delete(`/api/v1/transactions/${body.id}`).expect(204);
      expect((await months())[0].committed.base).toBe('0.00');
    });

    it('a scheduled income is expected in its month', async () => {
      const bonus = await category(ctx.app, user, 'Sueldo');
      await api()
        .post('/api/v1/transactions')
        .send({
          type: 'INCOME',
          pocketId: galicia.id,
          categoryId: bonus.id,
          amount: '100000',
          date: '2026-12-15',
        })
        .expect(201);
      const [, december] = await months();
      expect(december.expectedIncome.base).toBe('100000.00');
    });

    it('confirmed before its date, it takes today; never a future date', async () => {
      const { body } = await turno();
      const future = await api()
        .post('/api/v1/transactions/confirm')
        .send({ items: [{ id: body.id, date: '2026-11-20' }] })
        .expect(422);
      expect(future.body.code).toBe('DATE_IN_FUTURE');
      const res = await api()
        .post('/api/v1/transactions/confirm')
        .send({ items: [{ id: body.id }] })
        .expect(200);
      expect(res.body[0]).toMatchObject({ status: 'CONFIRMED', date: '2026-11-01' });
      expect(await balance()).toBe('955000.00');
    });

    it('on its date it is to confirm; confirmed, it is spent and not committed', async () => {
      const { body } = await turno();
      const later = await createTestApp({ CLOCK_TODAY: '2026-11-20' });
      try {
        const there = as(later.app, user);
        const due = await there
          .get('/api/v1/movements?status=PENDING&until=2026-11-20')
          .expect(200);
        expect(due.body.items.map((m: { id: string }) => m.id)).toEqual([body.id]);
        expect((await there.get('/api/v1/dashboard').expect(200)).body.pending.count).toBe(1);

        await there
          .post('/api/v1/transactions/confirm')
          .send({ items: [{ id: body.id, amount: '47000', date: '2026-11-19' }] })
          .expect(200);
        const home = (await there.get('/api/v1/dashboard').expect(200)).body;
        expect(home).toMatchObject({ spent: '47000.00', toPay: '0.00', pending: { count: 0 } });
        expect((await there.get(`/api/v1/pockets/${galicia.id}`).expect(200)).body.balance).toBe(
          '953000.00',
        );
      } finally {
        await later.app.close();
      }
    });

    it('transfers, adjustments and confirmed movements are dated up to today', async () => {
      const other = await createPocket(ctx.app, user, { name: 'Mercado Pago' });
      const transfer = await api()
        .post('/api/v1/transfers')
        .send({
          fromPocketId: galicia.id,
          toPocketId: other.id,
          amountOut: '10',
          date: '2026-11-02',
        })
        .expect(422);
      expect(transfer.body.code).toBe('DATE_IN_FUTURE');
      const adjust = await api()
        .post(`/api/v1/pockets/${galicia.id}/adjust`)
        .send({ balance: '10', date: '2026-11-02' })
        .expect(422);
      expect(adjust.body.code).toBe('DATE_IN_FUTURE');
      const coto = await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: galicia.id,
          categoryId: health.id,
          amount: '100',
          date: '2026-11-01',
        })
        .expect(201);
      expect(coto.body.status).toBe('CONFIRMED');
      const moved = await api()
        .patch(`/api/v1/transactions/${coto.body.id}`)
        .send({ date: '2026-11-05' })
        .expect(422);
      expect(moved.body.code).toBe('DATE_IN_FUTURE');
    });

    it('isolation: another user does not see my scheduled movements', async () => {
      await turno();
      const other = await registerUser(ctx.app);
      const theirs = await as(ctx.app, other).get('/api/v1/commitments?months=1').expect(200);
      expect(theirs.body.months[0].items).toEqual([]);
      const home = await as(ctx.app, other).get('/api/v1/dashboard').expect(200);
      expect(home.body.upcoming).toEqual([]);
    });
  });
});
