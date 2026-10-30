import { as } from '../auth-helpers';
import { balanceOf } from '../fixtures';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { Scenario, seedScenario, SECURITY_ENV } from './seed';

describe('security: business logic', () => {
  let ctx: TestContext;
  let s: Scenario;

  const api = () => as(ctx.app, s.a.user);

  beforeAll(async () => {
    ctx = await createTestApp(SECURITY_ENV);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    s = await seedScenario(ctx.app, ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('SEC-LOGIC-01 a same-currency transfer with amountIn different from amountOut is rejected', async () => {
    const before = await balanceOf(ctx.app, s.a.user, s.a.investment.id);
    const res = await api().post('/api/v1/transfers').send({
      fromPocketId: s.a.ars.id,
      toPocketId: s.a.investment.id,
      amountOut: '1',
      amountIn: '1000000',
      date: '2026-10-20',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await balanceOf(ctx.app, s.a.user, s.a.investment.id)).toBe(before);
  });

  it('SEC-LOGIC-02 a transfer from a pocket to itself is rejected', async () => {
    const res = await api().post('/api/v1/transfers').send({
      fromPocketId: s.a.ars.id,
      toPocketId: s.a.ars.id,
      amountOut: '10',
      date: '2026-10-20',
    });
    expect(res.status).toBe(400);
  });

  it('SEC-LOGIC-03 the same creation sent twice creates two movements (documented: no idempotency key)', async () => {
    const body = {
      type: 'EXPENSE',
      pocketId: s.a.ars.id,
      categoryId: s.a.category.id,
      amount: '777',
      date: '2026-10-21',
      description: 'Doble click',
    };
    const [first, second] = await Promise.all([
      api().post('/api/v1/transactions').send(body),
      api().post('/api/v1/transactions').send(body),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(
      await ctx.prisma.transaction.count({
        where: { userId: s.a.user.id, description: 'Doble click' },
      }),
    ).toBe(2);
  });

  it('SEC-LOGIC-04 five parallel syncs never duplicate pending movements or statements', async () => {
    // A new fixed item for next month and a fresh app day so sync has work to do.
    await api()
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Internet',
        categoryId: s.a.expenseCategory.id,
        pocketId: s.a.ars.id,
        amount: '20000',
        dayOfMonth: 15,
        startPeriod: '2026-10',
      })
      .expect(201);
    const results = await Promise.all(Array.from({ length: 5 }, () => api().post('/api/v1/sync')));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const pending = await ctx.prisma.transaction.groupBy({
      by: ['fixedId', 'fixedPeriod'],
      where: { userId: s.a.user.id, status: 'PENDING', fixedId: { not: null } },
      _count: true,
    });
    expect(pending.filter((p) => p._count > 1)).toEqual([]);
    const statements = await ctx.prisma.cardStatement.groupBy({
      by: ['cardId', 'period'],
      where: { card: { userId: s.a.user.id } },
      _count: true,
    });
    expect(statements.filter((st) => st._count > 1)).toEqual([]);
  });

  it('SEC-LOGIC-05 closing twice, overpaying and paying an open statement leave consistent states', async () => {
    const closed = s.a.closedStatement;
    const again = await api().post(`/api/v1/statements/${closed.id}/close`).send({});
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.status).toBeLessThan(500);

    const open = await api()
      .post(`/api/v1/statements/${s.a.openStatement.id}/payments`)
      .send({ pocketId: s.a.ars.id, currency: 'ARS', amount: '1', date: '2026-10-22' });
    expect(open.status).toBe(422);
    expect(open.body.code).toBe('STATEMENT_NOT_CLOSED');

    // Documented (SEC-F11, to decide): paying more than the total is accepted; the statement
    // ends PAID with nothing pending, and the extra money leaves the pocket.
    const over = await api()
      .post(`/api/v1/statements/${closed.id}/payments`)
      .send({ pocketId: s.a.ars.id, currency: 'ARS', amount: '99999999', date: '2026-10-22' });
    expect(over.status).toBe(201);
    const detail = (await api().get(`/api/v1/statements/${closed.id}`).expect(200)).body;
    expect(detail.status).toBe('PAID');
    expect(Number(detail.pending.ARS)).toBeGreaterThanOrEqual(0);
  });

  it('SEC-LOGIC-06 amount, date and installments of a charge in a closed statement cannot change; description and category can', async () => {
    const url = `/api/v1/charges/${s.a.charge.id}`;
    for (const change of [{ totalAmount: '1' }, { date: '2026-10-01' }, { installmentsCount: 1 }]) {
      const res = await api().patch(url).send(change);
      expect(res.status, JSON.stringify(change)).toBe(409);
      expect(res.body.code).toBe('CARD_STATEMENT_CLOSED');
    }
    const del = await api().delete(url);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('CARD_STATEMENT_CLOSED');
    await api().patch(url).send({ description: 'Heladera nueva' }).expect(200);
    await api().patch(url).send({ categoryId: s.a.category.id }).expect(200);
  });

  it('SEC-LOGIC-07 a valuation that is not the last one cannot be deleted', async () => {
    await api()
      .post('/api/v1/investments/valuations')
      .send({ items: [{ pocketId: s.a.investment.id, date: '2026-10-22', value: '115000' }] })
      .expect(201);
    const res = await api().delete(`/api/v1/valuations/${s.a.valuationId}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await ctx.prisma.pocketValuation.count({ where: { id: s.a.valuationId } })).toBe(1);
  });

  it('SEC-LOGIC-08 a pocket with a balance cannot be archived', async () => {
    const res = await api().patch(`/api/v1/pockets/${s.a.usd.id}`).send({ archived: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('POCKET_NOT_EMPTY');
  });

  it('SEC-LOGIC-09 system movements (yield, adjustment) cannot be edited or deleted as manual ones', async () => {
    await api()
      .post(`/api/v1/pockets/${s.a.ars.id}/adjust`)
      .send({ balance: '5', date: '2026-10-22' })
      .expect(200);
    const system = await ctx.prisma.transaction.findMany({
      where: { userId: s.a.user.id, origin: { in: ['ADJUSTMENT', 'VALUATION'] } },
    });
    expect(system.map((t) => t.origin).sort()).toEqual(['ADJUSTMENT', 'VALUATION']);
    const results: Record<string, number[]> = {};
    for (const tx of system) {
      const url = `/api/v1/transactions/${tx.id}`;
      results[tx.origin] = [
        (await api().patch(url).send({ amount: '1' })).status,
        (await api().patch(url).send({ description: 'Editado' })).status,
        (await api().delete(url)).status,
      ];
    }
    // Neither can be edited. A yield is undone only by deleting its valuation (INV-04); an
    // adjustment can be deleted, which undoes it (the balance is recalculated, never stored).
    expect(results['VALUATION']).toEqual([422, 422, 422]);
    expect(results['ADJUSTMENT']).toEqual([422, 422, 204]);
  });
});
