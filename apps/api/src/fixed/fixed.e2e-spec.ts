import type { Pocket, Category, FixedItem } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { balanceOf, category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/**
 * Fixed items, sync and commitments together, simulating the passing of months with one app
 * per "today" (CLOCK_TODAY).
 */
describe('fixed items, sync and commitments', () => {
  let october: TestContext;
  let november: TestContext;
  let user: TestUser;
  let galicia: Pocket;
  let dollars: Pocket;
  let rentCategory: Category;
  let salaryCategory: Category;

  const in_ = (ctx: TestContext) => as(ctx.app, user);
  const createFixed = async (body: Record<string, unknown>): Promise<FixedItem> =>
    (await in_(october).post('/api/v1/fixed').send(body).expect(201)).body;
  const pending = async (ctx: TestContext) =>
    (await in_(ctx).get('/api/v1/movements?status=PENDING').expect(200)).body.items as {
      id: string;
      description: string;
      amount: string;
      date: string;
    }[];

  beforeAll(async () => {
    october = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
    november = await createTestApp({ CLOCK_TODAY: '2026-11-02' });
  });

  beforeEach(async () => {
    await resetDatabase(october.prisma);
    user = await registerUser(october.app);
    galicia = await createPocket(october.app, user, { name: 'Galicia', initialBalance: '100000' });
    dollars = await createPocket(october.app, user, { name: 'Caja USD', currency: 'USD' });
    rentCategory = await category(october.app, user, 'Alquiler');
    salaryCategory = await category(october.app, user, 'Sueldo');
  });

  afterAll(async () => {
    await october.app.close();
    await november.app.close();
  });

  const rentAndSalary = async () => {
    const rent = await createFixed({
      kind: 'EXPENSE',
      name: 'Alquiler',
      categoryId: rentCategory.id,
      pocketId: galicia.id,
      amount: '380000',
      dayOfMonth: 10,
      startPeriod: '2026-10',
    });
    const salary = await createFixed({
      kind: 'INCOME',
      name: 'Sueldo',
      categoryId: salaryCategory.id,
      pocketId: galicia.id,
      amount: '1850000',
      dayOfMonth: 1,
      startPeriod: '2026-10',
    });
    return { rent, salary };
  };

  it('creates a fixed item with its amount in force and next occurrence (FIJ-01)', async () => {
    const { rent } = await rentAndSalary();
    expect(rent).toMatchObject({
      kind: 'EXPENSE',
      currency: 'ARS',
      intervalMonths: 1,
      currentAmount: '380000.00',
      paused: false,
      next: { period: '2026-10', date: '2026-10-10', amount: '380000.00' },
      pocket: { name: 'Disponible', accountName: 'Galicia' },
    });
  });

  it('opening the app generates the pending movements once per period (FIJ-04, idempotent)', async () => {
    await rentAndSalary();
    const first = await in_(october).post('/api/v1/sync').expect(200);
    expect(first.body).toMatchObject({ generatedPending: 2, pendingCount: 2 });
    const again = await in_(october).post('/api/v1/sync').expect(200);
    expect(again.body).toMatchObject({ generatedPending: 0, pendingCount: 2 });

    // Next month: only November is added, once.
    const next = await in_(november).post('/api/v1/sync').expect(200);
    expect(next.body).toMatchObject({ generatedPending: 2, pendingCount: 4 });
    await in_(november).post('/api/v1/sync').expect(200);
    const items = await pending(november);
    expect(items.map((i) => `${i.description} ${i.date}`).sort()).toEqual([
      'Alquiler 2026-10-10',
      'Alquiler 2026-11-10',
      'Sueldo 2026-10-01',
      'Sueldo 2026-11-01',
    ]);

    // Pending movements don't touch the balance until confirmed in batch (MOV-05).
    expect(await balanceOf(november.app, user, galicia.id)).toBe('100000.00');
    const october_ = items.filter((i) => i.date.startsWith('2026-10'));
    await in_(november)
      .post('/api/v1/transactions/confirm')
      .send({ items: october_.map((i) => ({ id: i.id })) })
      .expect(200);
    expect(await balanceOf(november.app, user, galicia.id)).toBe('1570000.00');
  });

  it('two overlapping syncs never duplicate', async () => {
    await rentAndSalary();
    await Promise.allSettled([
      in_(october).post('/api/v1/sync'),
      in_(october).post('/api/v1/sync'),
      in_(october).post('/api/v1/sync'),
    ]);
    expect(await pending(october)).toHaveLength(2);
  });

  it('a raise from a month keeps earlier periods and updates pending ones from then (FIJ-02)', async () => {
    const { rent } = await rentAndSalary();
    await in_(october).post('/api/v1/sync').expect(200);
    await in_(november).post('/api/v1/sync').expect(200);
    const raised = await in_(november)
      .post(`/api/v1/fixed/${rent.id}/amounts`)
      .send({ amount: '450000', effectiveFrom: '2026-11' })
      .expect(200);
    expect(raised.body.currentAmount).toBe('450000.00');
    expect(raised.body.amounts).toEqual([
      { amount: '380000.00', effectiveFrom: '2026-10' },
      { amount: '450000.00', effectiveFrom: '2026-11' },
    ]);
    const rents = (await pending(november)).filter((i) => i.description === 'Alquiler');
    expect(rents.map((i) => `${i.date} ${i.amount}`).sort()).toEqual([
      '2026-10-10 380000.00',
      '2026-11-10 450000.00',
    ]);
  });

  it('a paused fixed item generates nothing; resuming does not back-fill (FIJ-03)', async () => {
    const { rent } = await rentAndSalary();
    await in_(october).patch(`/api/v1/fixed/${rent.id}`).send({ paused: true }).expect(200);
    await in_(october).post('/api/v1/sync').expect(200);
    await in_(november).post('/api/v1/sync').expect(200);
    expect((await pending(november)).map((i) => i.description)).toEqual(['Sueldo', 'Sueldo']);

    await in_(november).patch(`/api/v1/fixed/${rent.id}`).send({ paused: false }).expect(200);
    await in_(november).post('/api/v1/sync').expect(200);
    const rents = (await pending(november)).filter((i) => i.description === 'Alquiler');
    expect(rents.map((i) => i.date)).toEqual(['2026-11-10']);
  });

  it('finishing a fixed item stops it after its last period', async () => {
    const { rent } = await rentAndSalary();
    await in_(october).patch(`/api/v1/fixed/${rent.id}`).send({ endPeriod: '2026-10' }).expect(200);
    await in_(november).post('/api/v1/sync').expect(200);
    expect((await pending(november)).filter((i) => i.description === 'Alquiler')).toHaveLength(1);
  });

  it('a pending movement in dollars freezes the rate when confirmed', async () => {
    await createFixed({
      kind: 'EXPENSE',
      name: 'iCloud',
      categoryId: rentCategory.id,
      pocketId: dollars.id,
      amount: '2.99',
      dayOfMonth: 15,
      startPeriod: '2026-10',
    });
    await in_(october).post('/api/v1/sync').expect(200);
    const [item] = await pending(october);
    const done = await in_(october)
      .post('/api/v1/transactions/confirm')
      .send({ items: [{ id: item.id }] })
      .expect(200);
    // The rate of its date (MEP 1200 in the fake provider).
    expect(done.body[0]).toMatchObject({ rateToBase: '1200.000000', baseAmount: '3588.00' });
  });

  it('commitments of 12 months add installments and fixed expenses by currency (COM-01/02)', async () => {
    await rentAndSalary();
    const card = (
      await in_(october)
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 30, dueDay: 5 })
        .expect(201)
    ).body;
    const tech = await category(october.app, user, 'Otros gastos');
    await in_(october)
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Heladera',
        categoryId: tech.id,
        totalAmount: '120000',
        currency: 'ARS',
        date: '2026-10-20',
        installmentsCount: 3,
      })
      .expect(201);
    await in_(october)
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Spotify',
        categoryId: tech.id,
        totalAmount: '24.99',
        currency: 'USD',
        date: '2026-10-20',
      })
      .expect(201);

    const res = await in_(october).get('/api/v1/commitments?months=12').expect(200);
    expect(res.body.months).toHaveLength(12);
    expect(res.body.rate).toBe('1200.000000');
    const [oct, nov, dec, jan, feb] = res.body.months;
    // October: rent only (the first statement is due in November).
    expect(oct).toMatchObject({
      period: '2026-10',
      committed: { byCurrency: [{ currency: 'ARS', amount: '380000.00' }] },
    });
    expect(oct.expectedIncome.byCurrency).toEqual([{ currency: 'ARS', amount: '1850000.00' }]);
    expect(oct.free).toBe('1470000.00');
    // November: rent + installment 1 + Spotify (24.99 × 1200 in base).
    expect(nov.committed).toEqual({
      byCurrency: [
        { currency: 'ARS', amount: '420000.00' },
        { currency: 'USD', amount: '24.99' },
      ],
      base: '449988.00',
    });
    expect(nov.items.map((i: { type: string }) => i.type)).toEqual([
      'INSTALLMENT',
      'INSTALLMENT',
      'FIXED',
    ]);
    const ars = (month: { committed: { byCurrency: { currency: string; amount: string }[] } }) =>
      month.committed.byCurrency.find((line) => line.currency === 'ARS')?.amount;
    expect(ars(dec)).toBe('420000.00');
    expect(ars(jan)).toBe('420000.00');
    expect(ars(feb)).toBe('380000.00');
  });

  it('isolation: fixed items of another user are invisible and not editable', async () => {
    const { rent } = await rentAndSalary();
    const other = await registerUser(october.app);
    const theirs = as(october.app, other);
    await theirs.get(`/api/v1/fixed/${rent.id}`).expect(404);
    await theirs.patch(`/api/v1/fixed/${rent.id}`).send({ paused: true }).expect(404);
    await theirs
      .post(`/api/v1/fixed/${rent.id}/amounts`)
      .send({ amount: '1', effectiveFrom: '2026-11' })
      .expect(404);
    await theirs.delete(`/api/v1/fixed/${rent.id}`).expect(404);
    await theirs
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'X',
        categoryId: rentCategory.id,
        pocketId: galicia.id,
        amount: '1',
        dayOfMonth: 1,
        startPeriod: '2026-10',
      })
      .expect(404);
    expect((await theirs.get('/api/v1/fixed').expect(200)).body).toEqual([]);
    const sync = await theirs.post('/api/v1/sync').expect(200);
    expect(sync.body).toMatchObject({ generatedPending: 0, pendingCount: 0 });
    const commitments = await theirs.get('/api/v1/commitments').expect(200);
    expect(commitments.body.months[0].committed).toEqual({ byCurrency: [], base: '0.00' });
  });
});
