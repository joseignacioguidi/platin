import type {
  Card,
  Category,
  Charge,
  ChargesPage,
  FixedItem,
  Pocket,
  StatementSummary,
} from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/** Phase 22: installment amount (TAR-02), history (TAR-12/13) and fixed items on a card (TAR-09). */
describe('cards: installments, history and fixed items', () => {
  let ctx: TestContext;
  let user: TestUser;
  let visa: Card;
  let galicia: Pocket;
  let tech: Category;
  let fees: Category;

  const api = () => as(ctx.app, user);
  const charge = async (body: Record<string, unknown>, card = visa): Promise<Charge> =>
    (
      await api()
        .post(`/api/v1/cards/${card.id}/charges`)
        .send({ categoryId: tech.id, currency: 'ARS', description: 'Compra', ...body })
        .expect(201)
    ).body;
  const statementOf = async (period: string): Promise<StatementSummary> => {
    const list: StatementSummary[] = (
      await api().get(`/api/v1/cards/${visa.id}/statements?from=2026-01&to=2027-12`).expect(200)
    ).body;
    const found = list.find((s) => s.period === period);
    if (!found) throw new Error(`No statement ${period}`);
    return found;
  };
  const close = async (period: string) => {
    const statement = await statementOf(period);
    await api()
      .post(`/api/v1/statements/${statement.id}/close`)
      .send({ adjustmentCategoryId: fees.id })
      .expect(200);
  };
  const charges = async (query = ''): Promise<ChargesPage> =>
    (await api().get(`/api/v1/charges${query}`).expect(200)).body;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '1000' });
    tech = await category(ctx.app, user, 'Otros gastos');
    fees = await category(ctx.app, user, 'Impuestos y comisiones');
    visa = (
      await api()
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 30, dueDay: 5 })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('TAR-02: loading the installment as the bank shows it', () => {
    it('12 cuotas de $ 45.833,33 → total $ 549.999,96, todas iguales', async () => {
      const created = await charge({
        date: '2026-10-10',
        installmentAmount: '45833.33',
        installmentsCount: 12,
      });
      expect(created.totalAmount).toBe('549999.96');
      expect(created.installments).toHaveLength(12);
      expect(new Set(created.installments.map((i) => i.amount))).toEqual(new Set(['45833.33']));
    });

    it('needs exactly one of total and installment amount', async () => {
      const base = {
        categoryId: tech.id,
        currency: 'ARS',
        description: 'X',
        date: '2026-10-10',
        installmentsCount: 3,
      };
      for (const body of [base, { ...base, totalAmount: '300', installmentAmount: '100' }]) {
        const res = await api().post(`/api/v1/cards/${visa.id}/charges`).send(body).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
    });

    it('cards only take pesos and dollars (MON-05)', async () => {
      await api()
        .post(`/api/v1/cards/${visa.id}/charges`)
        .send({
          categoryId: tech.id,
          currency: 'EUR',
          description: 'X',
          date: '2026-10-10',
          totalAmount: '10',
        })
        .expect(400);
    });
  });

  describe('TAR-12: statement history', () => {
    it('lists closed statements newest first, a page at a time', async () => {
      await charge({ date: '2026-07-10', totalAmount: '400', installmentsCount: 4 });
      for (const period of ['2026-07', '2026-08', '2026-09']) await close(period);

      const first: StatementSummary[] = (
        await api().get(`/api/v1/cards/${visa.id}/statements?status=closed&limit=2`).expect(200)
      ).body;
      expect(first.map((s) => [s.period, s.status, s.totals.ARS])).toEqual([
        ['2026-09', 'CLOSED', '100.00'],
        ['2026-08', 'CLOSED', '100.00'],
      ]);
      const next: StatementSummary[] = (
        await api()
          .get(`/api/v1/cards/${visa.id}/statements?status=closed&limit=2&cursor=2026-08`)
          .expect(200)
      ).body;
      expect(next.map((s) => s.period)).toEqual(['2026-07']);

      // Each one opens with its detail.
      const detail = await api().get(`/api/v1/statements/${first[0].id}`).expect(200);
      expect(detail.body.installments).toEqual([
        expect.objectContaining({ number: 3, count: 4, amount: '100.00' }),
      ]);
    });
  });

  describe('TAR-13: purchase history', () => {
    it('filters by card, text, dates and status, with "k de N" and a cursor', async () => {
      const master: Card = (
        await api()
          .post('/api/v1/cards')
          .send({ name: 'Master', closingDay: 15, dueDay: 25 })
          .expect(201)
      ).body;
      // A plan that ends in September (closed) and one still running.
      await charge({
        date: '2026-08-10',
        totalAmount: '200',
        installmentsCount: 2,
        description: 'Zapatillas',
      });
      await charge({
        date: '2026-09-10',
        totalAmount: '1200',
        installmentsCount: 12,
        description: 'Heladera',
      });
      await charge({ date: '2026-10-01', totalAmount: '50', description: 'Cine' }, master);
      await close('2026-08');
      await close('2026-09');

      const all = await charges();
      expect(all.items.map((c) => c.description)).toEqual(['Cine', 'Heladera', 'Zapatillas']);
      expect(all.items[1]).toMatchObject({
        cardName: 'Visa',
        totalAmount: '1200.00',
        installmentAmount: '100.00',
        installmentsCount: 12,
        current: 1,
        status: 'active',
        fromFixed: false,
      });
      expect(all.items[2]).toMatchObject({ current: 2, status: 'finished' });

      expect((await charges(`?cardId=${master.id}`)).items.map((c) => c.description)).toEqual([
        'Cine',
      ]);
      expect((await charges('?query=helad')).items.map((c) => c.description)).toEqual(['Heladera']);
      expect((await charges('?status=finished')).items.map((c) => c.description)).toEqual([
        'Zapatillas',
      ]);
      expect(
        (await charges('?from=2026-09-01&to=2026-09-30')).items.map((c) => c.description),
      ).toEqual(['Heladera']);

      const page = await charges('?limit=2');
      expect(page.items).toHaveLength(2);
      const rest = await charges(`?limit=2&cursor=${page.nextCursor}`);
      expect(rest.items.map((c) => c.description)).toEqual(['Zapatillas']);
      expect(rest.nextCursor).toBeNull();
    });

    it('isolation: another user sees no purchases and cannot filter by my card', async () => {
      await charge({ date: '2026-10-01', totalAmount: '50' });
      const other = as(ctx.app, await registerUser(ctx.app));
      expect((await other.get('/api/v1/charges').expect(200)).body.items).toEqual([]);
      await other.get(`/api/v1/charges?cardId=${visa.id}`).expect(404);
      await other.get(`/api/v1/cards/${visa.id}/statements?status=closed`).expect(404);
    });
  });

  describe('TAR-09: fixed items on a card', () => {
    const subscription = async (body: Record<string, unknown> = {}): Promise<FixedItem> =>
      (
        await api()
          .post('/api/v1/fixed')
          .send({
            kind: 'EXPENSE',
            name: 'Spotify',
            categoryId: tech.id,
            cardId: visa.id,
            currency: 'USD',
            amount: '9.99',
            dayOfMonth: 12,
            startPeriod: '2026-09',
            ...body,
          })
          .expect(201)
      ).body;
    const fixedCharges = async () =>
      (await charges(`?cardId=${visa.id}`)).items.filter((c) => c.fromFixed);

    it('each sync loads one charge per due period, once, in the statement of its day', async () => {
      const fixed = await subscription();
      expect(fixed).toMatchObject({
        card: { id: visa.id, name: 'Visa' },
        pocket: null,
        currency: 'USD',
      });

      // Two syncs at the same time and one after: still one charge per period.
      const [a, b] = await Promise.all([
        api().post('/api/v1/sync').expect(200),
        api().post('/api/v1/sync').expect(200),
      ]);
      expect(a.body.generatedCharges + b.body.generatedCharges).toBe(2);
      await api().post('/api/v1/sync').expect(200);

      const loaded = await fixedCharges();
      expect(loaded.map((c) => [c.date, c.totalAmount, c.currency, c.installmentsCount])).toEqual([
        ['2026-10-12', '9.99', 'USD', 1],
        ['2026-09-12', '9.99', 'USD', 1],
      ]);
      expect((await statementOf('2026-10')).totals.USD).toBe('9.99');
      // No pending movements: it's a card charge.
      expect(a.body.generatedPending + b.body.generatedPending).toBe(0);
      const detail: Charge = (await api().get(`/api/v1/charges/${loaded[0].id}`).expect(200)).body;
      expect(detail.fixedId).toBe(fixed.id);
    });

    it('uses the amount in force for each period (FIJ-02)', async () => {
      const fixed = await subscription({ amount: '9.99' });
      await api()
        .post(`/api/v1/fixed/${fixed.id}/amounts`)
        .send({ amount: '11.99', effectiveFrom: '2026-10' })
        .expect(200);
      await api().post('/api/v1/sync').expect(200);
      expect((await fixedCharges()).map((c) => c.totalAmount)).toEqual(['11.99', '9.99']);
    });

    it('a paused fixed item loads nothing', async () => {
      const fixed = await subscription({ startPeriod: '2026-10' });
      await api().patch(`/api/v1/fixed/${fixed.id}`).send({ paused: true }).expect(200);
      const res = await api().post('/api/v1/sync').expect(200);
      expect(res.body.generatedCharges).toBe(0);
      expect(await fixedCharges()).toEqual([]);
    });

    it('validates the card fixed item and keeps it on a card', async () => {
      const bad = [
        { cardId: visa.id, pocketId: galicia.id },
        { cardId: visa.id, currency: undefined },
        { cardId: visa.id, kind: 'INCOME' },
        { cardId: visa.id, currency: 'EUR' },
      ];
      for (const body of bad) {
        await api()
          .post('/api/v1/fixed')
          .send({
            kind: 'EXPENSE',
            name: 'X',
            categoryId: tech.id,
            currency: 'USD',
            amount: '1',
            dayOfMonth: 1,
            startPeriod: '2026-10',
            ...body,
          })
          .expect(400);
      }
      const fixed = await subscription();
      await api().patch(`/api/v1/fixed/${fixed.id}`).send({ pocketId: galicia.id }).expect(400);
    });

    it('a fixed item that already loaded charges cannot be deleted', async () => {
      const fixed = await subscription({ startPeriod: '2026-10' });
      await api().post('/api/v1/sync').expect(200);
      const res = await api().delete(`/api/v1/fixed/${fixed.id}`).expect(409);
      expect(res.body.code).toBe('FIXED_HAS_HISTORY');
    });

    it("isolation: a fixed item can't use another user's card", async () => {
      const other = as(ctx.app, await registerUser(ctx.app));
      const theirCategory = (await other.get('/api/v1/categories').expect(200)).body.find(
        (c: Category) => c.kind === 'EXPENSE' && !c.systemKey,
      );
      await other
        .post('/api/v1/fixed')
        .send({
          kind: 'EXPENSE',
          name: 'X',
          categoryId: theirCategory.id,
          cardId: visa.id,
          currency: 'ARS',
          amount: '1',
          dayOfMonth: 1,
          startPeriod: '2026-10',
        })
        .expect(404);
    });
  });
});
