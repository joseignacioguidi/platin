import type { Account, Card, Category, Charge, StatementSummary } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('cards', () => {
  let ctx: TestContext;
  let user: TestUser;
  let visa: Card;
  let galicia: Account;
  let tech: Category;
  let fees: Category;

  const api = () => as(ctx.app, user);
  const charge = async (body: Record<string, unknown>): Promise<Charge> =>
    (
      await api()
        .post(`/api/v1/cards/${visa.id}/charges`)
        .send({ categoryId: tech.id, currency: 'ARS', description: 'Compra', ...body })
        .expect(201)
    ).body;
  const statements = async (): Promise<StatementSummary[]> =>
    (await api().get(`/api/v1/cards/${visa.id}/statements?from=2026-09&to=2027-11`).expect(200))
      .body;
  const statementOf = async (period: string) => {
    const found = (await statements()).find((s) => s.period === period);
    if (!found) throw new Error(`No statement ${period}`);
    return found;
  };

  beforeAll(async () => {
    // "Today" is fixed so cycles are deterministic.
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    galicia = await createAccount(ctx.app, user, { name: 'Galicia', initialBalance: '2000000' });
    tech = await category(ctx.app, user, 'Otros gastos');
    fees = await category(ctx.app, user, 'Impuestos y comisiones');
    visa = (
      await api()
        .post('/api/v1/cards')
        .send({
          name: 'Visa Galicia',
          last4: '4821',
          creditLimit: '2000000',
          closingDay: 30,
          dueDay: 5,
        })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('creates a card with its open statement (TAR-01)', async () => {
    expect(visa).toMatchObject({
      name: 'Visa Galicia',
      last4: '4821',
      creditLimit: '2000000.00',
      closingDay: 30,
      dueDay: 5,
      available: '2000000.00',
      openStatement: {
        period: '2026-10',
        closingDate: '2026-10-30',
        dueDate: '2026-11-05',
        status: 'OPEN',
      },
    });
  });

  it('$ 550.000 in 12 installments the day before closing starts in that statement', async () => {
    const created = await charge({
      date: '2026-10-29',
      totalAmount: '550000',
      installmentsCount: 12,
    });
    expect(created.installments).toHaveLength(12);
    expect(created.installments[0]).toMatchObject({
      number: 1,
      period: '2026-10',
      amount: '45833.33',
    });
    expect(created.installments[11]).toMatchObject({
      number: 12,
      period: '2027-09',
      amount: '45833.37',
    });
  });

  it('the day after closing it starts in the next statement', async () => {
    const created = await charge({
      date: '2026-10-31',
      totalAmount: '550000',
      installmentsCount: 12,
    });
    expect(created.installments[0].period).toBe('2026-11');
    expect(created.installments[11].period).toBe('2027-10');
  });

  it('"voy por la 4 de 12" generates installments 4 to 12 from the open statement (TAR-03)', async () => {
    const migrated = await charge({
      date: '2026-07-15',
      totalAmount: '550000',
      installmentsCount: 12,
      startInstallment: 4,
      description: 'Heladera',
    });
    expect(migrated.installments.map((i) => i.number)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(migrated.installments[0].period).toBe('2026-10');
    const plans = (await api().get(`/api/v1/cards/${visa.id}/installments?active=true`).expect(200))
      .body;
    expect(plans[0]).toMatchObject({
      description: 'Heladera',
      count: 12,
      current: 3,
      remainingCount: 9,
    });
  });

  it('statement totals add installments by currency (TAR-04)', async () => {
    await charge({ date: '2026-10-29', totalAmount: '550000', installmentsCount: 12 });
    await charge({
      date: '2026-10-10',
      totalAmount: '24.99',
      currency: 'USD',
      description: 'Spotify',
    });
    const october = await statementOf('2026-10');
    expect(october.totals).toEqual({ ARS: '45833.33', USD: '24.99' });
    const card = (await api().get(`/api/v1/cards/${visa.id}`).expect(200)).body as Card;
    expect(card.committedArs).toBe('550000.00');
    expect(card.available).toBe('1450000.00');
  });

  it('closes with the bank total (difference as adjustment) and pays it (TAR-07/08)', async () => {
    await charge({ date: '2026-10-29', totalAmount: '550000', installmentsCount: 12 });
    const october = await statementOf('2026-10');

    const missingCategory = await api()
      .post(`/api/v1/statements/${october.id}/close`)
      .send({ bankTotalArs: '47333.33' })
      .expect(422);
    expect(missingCategory.body.code).toBe('ADJUSTMENT_CATEGORY_REQUIRED');

    const closed = await api()
      .post(`/api/v1/statements/${october.id}/close`)
      .send({ bankTotalArs: '47333.33', adjustmentCategoryId: fees.id, description: 'Intereses' })
      .expect(200);
    expect(closed.body).toMatchObject({
      status: 'CLOSED',
      totals: { ARS: '47333.33' },
      bankTotalArs: '47333.33',
    });

    const detail = await api().get(`/api/v1/statements/${october.id}`).expect(200);
    expect(detail.body.adjustments).toEqual([
      expect.objectContaining({ amount: '1500.00', currency: 'ARS', description: 'Intereses' }),
    ]);

    const partial = await api()
      .post(`/api/v1/statements/${october.id}/payments`)
      .send({ accountId: galicia.id, currency: 'ARS', amount: '20000', date: '2026-11-04' })
      .expect(201);
    expect(partial.body).toMatchObject({ status: 'PARTIALLY_PAID', pending: { ARS: '27333.33' } });

    const paid = await api()
      .post(`/api/v1/statements/${october.id}/payments`)
      .send({ accountId: galicia.id, currency: 'ARS', amount: '27333.33', date: '2026-11-05' })
      .expect(201);
    expect(paid.body).toMatchObject({ status: 'PAID', pending: { ARS: '0.00', USD: '0.00' } });
    expect(await balanceOf(ctx.app, user, galicia.id)).toBe('1952666.67');

    // The payment shows in movements as a transfer to the statement.
    const movements = await api().get('/api/v1/movements?type=TRANSFER').expect(200);
    expect(movements.body.items[0]).toMatchObject({
      kind: 'TRANSFER',
      toAccount: null,
      statement: { cardName: 'Visa Galicia', period: '2026-10' },
    });
  });

  it('pays the dollar part with pesos when amountOut is given', async () => {
    await charge({
      date: '2026-10-10',
      totalAmount: '24.99',
      currency: 'USD',
      description: 'Spotify',
    });
    const october = await statementOf('2026-10');
    await api().post(`/api/v1/statements/${october.id}/close`).send({}).expect(200);
    const missing = await api()
      .post(`/api/v1/statements/${october.id}/payments`)
      .send({ accountId: galicia.id, currency: 'USD', amount: '24.99', date: '2026-11-05' })
      .expect(422);
    expect(missing.body.code).toBe('PAYMENT_AMOUNT_OUT_REQUIRED');
    const paid = await api()
      .post(`/api/v1/statements/${october.id}/payments`)
      .send({
        accountId: galicia.id,
        currency: 'USD',
        amount: '24.99',
        amountOut: '31237.50',
        date: '2026-11-05',
      })
      .expect(201);
    expect(paid.body.status).toBe('PAID');
    expect(await balanceOf(ctx.app, user, galicia.id)).toBe('1968762.50');
  });

  it('a purchase dated in a closed statement goes to the next open one', async () => {
    const october = await statementOf('2026-10');
    await api().post(`/api/v1/statements/${october.id}/close`).send({}).expect(200);
    const late = await charge({ date: '2026-10-20', totalAmount: '10000' });
    expect(late.installments[0].period).toBe('2026-11');
  });

  it('editing amounts of a charge with closed installments is rejected (CARD_STATEMENT_CLOSED)', async () => {
    const created = await charge({
      date: '2026-10-29',
      totalAmount: '120000',
      installmentsCount: 3,
    });
    // Before closing: the plan is regenerated.
    const edited = await api()
      .patch(`/api/v1/charges/${created.id}`)
      .send({ totalAmount: '90000', installmentsCount: 6 })
      .expect(200);
    expect(edited.body.installments.map((i: { amount: string }) => i.amount)).toEqual([
      '15000.00',
      '15000.00',
      '15000.00',
      '15000.00',
      '15000.00',
      '15000.00',
    ]);

    const october = await statementOf('2026-10');
    await api().post(`/api/v1/statements/${october.id}/close`).send({}).expect(200);
    const rejected = await api()
      .patch(`/api/v1/charges/${created.id}`)
      .send({ totalAmount: '1000' })
      .expect(409);
    expect(rejected.body.code).toBe('CARD_STATEMENT_CLOSED');
    await api().delete(`/api/v1/charges/${created.id}`).expect(409);
    // The description and category can still change, even if the unchanged amount, date and
    // installments come along (TAR-11: the edit form sends the whole charge).
    const renamed = await api()
      .patch(`/api/v1/charges/${created.id}`)
      .send({
        description: 'Notebook',
        totalAmount: '90000.00',
        date: '2026-10-29',
        installmentsCount: 6,
      })
      .expect(200);
    expect(renamed.body.description).toBe('Notebook');

    const plans = (await api().get(`/api/v1/cards/${visa.id}/installments`).expect(200)).body;
    expect(plans[0]).toMatchObject({ current: 1, remainingCount: 5, remainingAmount: '75000.00' });
  });

  it('deletes a charge while all its statements are open', async () => {
    const created = await charge({
      date: '2026-10-29',
      totalAmount: '120000',
      installmentsCount: 3,
    });
    await api().delete(`/api/v1/charges/${created.id}`).expect(204);
    expect((await statementOf('2026-10')).totals.ARS).toBe('0.00');
  });

  it('card purchases appear in movements (filter CARD) and in the month expenses', async () => {
    await charge({ date: '2026-10-22', totalAmount: '12300', description: 'PedidosYa' });
    const cardOnly = await api().get('/api/v1/movements?type=CARD').expect(200);
    expect(cardOnly.body.items).toEqual([
      expect.objectContaining({
        kind: 'CARD_CHARGE',
        description: 'PedidosYa',
        totalAmount: '12300.00',
        card: { id: visa.id, name: 'Visa Galicia' },
      }),
    ]);
    const summary = await api().get('/api/v1/movements/summary?period=2026-10').expect(200);
    expect(summary.body.expense).toBe('12300.00');
  });

  it('validates days and plans', async () => {
    await api().post('/api/v1/cards').send({ name: 'X', closingDay: 0, dueDay: 5 }).expect(400);
    await api()
      .post(`/api/v1/cards/${visa.id}/charges`)
      .send({
        categoryId: tech.id,
        currency: 'ARS',
        description: 'X',
        date: '2026-10-01',
        totalAmount: '10',
        installmentsCount: 3,
        startInstallment: 4,
      })
      .expect(400);
  });

  it('isolation: another user cannot see or use my cards, statements or charges', async () => {
    const mine = await charge({ date: '2026-10-29', totalAmount: '1000' });
    const october = await statementOf('2026-10');
    const other = await registerUser(ctx.app);
    const theirs = as(ctx.app, other);
    await theirs.get(`/api/v1/cards/${visa.id}`).expect(404);
    await theirs.get(`/api/v1/cards/${visa.id}/statements`).expect(404);
    await theirs.get(`/api/v1/cards/${visa.id}/installments`).expect(404);
    await theirs
      .post(`/api/v1/cards/${visa.id}/charges`)
      .send({
        categoryId: tech.id,
        currency: 'ARS',
        description: 'X',
        date: '2026-10-01',
        totalAmount: '10',
      })
      .expect(404);
    await theirs.get(`/api/v1/charges/${mine.id}`).expect(404);
    await theirs.delete(`/api/v1/charges/${mine.id}`).expect(404);
    await theirs.get(`/api/v1/statements/${october.id}`).expect(404);
    await theirs.post(`/api/v1/statements/${october.id}/close`).send({}).expect(404);
    expect((await theirs.get('/api/v1/cards').expect(200)).body).toEqual([]);
    expect((await theirs.get('/api/v1/movements?type=CARD').expect(200)).body.items).toEqual([]);
  });
});
