import type {
  Card,
  Category,
  InstallmentStatement,
  Pocket,
  StatementPlanInstallment,
  StatementSummary,
} from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/** Phase 35: the most used counts (TAR-02) and the "Cuotas" tab by statement (TAR-05, COM-03). */
describe('cards: installments by statement', () => {
  let ctx: TestContext;
  let user: TestUser;
  let visa: Card;
  let galicia: Pocket;
  let tech: Category;

  const api = () => as(ctx.app, user);
  const charge = (body: Record<string, unknown>, card = visa) =>
    api()
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({ categoryId: tech.id, currency: 'ARS', description: 'Compra', ...body })
      .expect(201);
  const summary = async (): Promise<InstallmentStatement[]> =>
    (await api().get(`/api/v1/cards/${visa.id}/statements/summary`).expect(200)).body;
  const ofPeriod = async (period: string): Promise<StatementPlanInstallment[]> =>
    (await api().get(`/api/v1/cards/${visa.id}/installments`).query({ period }).expect(200)).body;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createPocket(ctx.app, user, { name: 'Galicia', initialBalance: '2000000' });
    tech = await category(ctx.app, user, 'Otros gastos');
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

  describe('topInstallments (regla "Cuotas más usadas")', () => {
    it('a new card offers 1 payment and 3 installments', () => {
      expect(visa.topInstallments).toEqual([1, 3]);
    });

    it('spec example: 6 × 1, 4 × 3, 4 × 6, 1 × 12 → [1, 3]', async () => {
      const counts = [...Array(6).fill(1), ...Array(4).fill(3), ...Array(4).fill(6), 12];
      for (const installmentsCount of counts) {
        await charge({ date: '2026-10-10', totalAmount: '12000', installmentsCount });
      }
      const card = (await api().get(`/api/v1/cards/${visa.id}`).expect(200)).body as Card;
      expect(card.topInstallments).toEqual([1, 3]);
    });

    it('counts only the last 12 months of this card', async () => {
      const other = (
        await api().post('/api/v1/cards').send({ name: 'Master', closingDay: 30, dueDay: 5 })
      ).body as Card;
      await charge({ date: '2026-10-01', totalAmount: '12000', installmentsCount: 12 });
      await charge({ date: '2026-10-02', totalAmount: '12000', installmentsCount: 6 });
      // Older than a year, and on another card: they don't count.
      for (const date of ['2025-09-01', '2025-09-02']) {
        await charge({ date, totalAmount: '12000', installmentsCount: 1 });
      }
      await charge({ date: '2026-10-03', totalAmount: '12000', installmentsCount: 3 }, other);
      const cards = (await api().get('/api/v1/cards').expect(200)).body as Card[];
      expect(cards.find((c) => c.id === visa.id)?.topInstallments).toEqual([6, 12]);
      expect(cards.find((c) => c.id === other.id)?.topInstallments).toEqual([1, 3]);
    });
  });

  describe('statements summary and installments of a period', () => {
    // A plan of $ 120.000 in 12 from the September statement (Sept 2026 … Aug 2027) and a
    // purchase in 1 payment in October. The September statement is closed and paid.
    beforeEach(async () => {
      await charge({
        date: '2026-09-15',
        description: 'Heladera',
        totalAmount: '120000',
        installmentsCount: 12,
      });
      await charge({ date: '2026-10-20', description: 'PedidosYa', totalAmount: '12300' });
      const september = (
        (await api().get(`/api/v1/cards/${visa.id}/statements?from=2026-09&to=2026-09`)).body as
          StatementSummary[]
      )[0];
      await api().post(`/api/v1/statements/${september.id}/close`).send({}).expect(200);
      await api()
        .post(`/api/v1/statements/${september.id}/payments`)
        .send({ pocketId: galicia.id, currency: 'ARS', amount: '10000', date: '2026-10-05' })
        .expect(201);
    });

    it('lists every statement from the first to the last with installments', async () => {
      const list = await summary();
      expect(list.map((s) => s.period)).toEqual([
        '2026-09',
        '2026-10',
        '2026-11',
        '2026-12',
        '2027-01',
        '2027-02',
        '2027-03',
        '2027-04',
        '2027-05',
        '2027-06',
        '2027-07',
        '2027-08',
      ]);
      expect(list[0]).toMatchObject({
        status: 'PAID',
        dueDate: '2026-10-05',
        installmentsCount: 1,
        installmentsTotal: { ARS: '10000.00', USD: '0.00' },
        releases: { ARS: '0.00', USD: '0.00' },
      });
      // October has the 1 payment purchase too; it doesn't count as a plan that ends.
      expect(list[1]).toMatchObject({
        status: 'OPEN',
        installmentsCount: 2,
        installmentsTotal: { ARS: '22300.00' },
        releases: { ARS: '0.00' },
      });
      expect(list[11]).toMatchObject({ installmentsCount: 1, releases: { ARS: '10000.00' } });
    });

    it('a plan of 12 seen in its first, sixth and last statement', async () => {
      expect(await ofPeriod('2026-09')).toEqual([
        expect.objectContaining({
          description: 'Heladera',
          number: 1,
          count: 12,
          amount: '10000.00',
          paidThrough: 1,
          remainingAfter: '110000.00',
        }),
      ]);
      expect(await ofPeriod('2027-02')).toEqual([
        expect.objectContaining({ number: 6, paidThrough: 6, remainingAfter: '60000.00' }),
      ]);
      expect(await ofPeriod('2027-08')).toEqual([
        expect.objectContaining({ number: 12, paidThrough: 12, remainingAfter: '0.00' }),
      ]);
    });

    it('includes purchases in 1 payment', async () => {
      const october = await ofPeriod('2026-10');
      expect(october.map((i) => [i.description, i.number, i.count, i.remainingAfter])).toEqual([
        ['PedidosYa', 1, 1, '0.00'],
        ['Heladera', 2, 12, '100000.00'],
      ]);
    });

    it('a period without installments is empty', async () => {
      expect(await ofPeriod('2027-09')).toEqual([]);
    });

    it('without a period it still answers the active plans', async () => {
      const plans = (await api().get(`/api/v1/cards/${visa.id}/installments`).expect(200)).body;
      expect(plans).toEqual([expect.objectContaining({ description: 'Heladera', current: 1 })]);
    });

    it('rejects a malformed period', async () => {
      await api()
        .get(`/api/v1/cards/${visa.id}/installments`)
        .query({ period: '2026-13' })
        .expect(400);
    });

    it('isolation: another user gets 404 and its counts are its own', async () => {
      const other = await registerUser(ctx.app);
      await as(ctx.app, other).get(`/api/v1/cards/${visa.id}/statements/summary`).expect(404);
      await as(ctx.app, other)
        .get(`/api/v1/cards/${visa.id}/installments`)
        .query({ period: '2026-10' })
        .expect(404);
      const own = (
        await as(ctx.app, other)
          .post('/api/v1/cards')
          .send({ name: 'Visa', closingDay: 30, dueDay: 5 })
          .expect(201)
      ).body as Card;
      expect(own.topInstallments).toEqual([1, 3]);
      expect((await as(ctx.app, other).get(`/api/v1/cards/${own.id}/statements/summary`)).body).toEqual(
        [],
      );
    });
  });
});
