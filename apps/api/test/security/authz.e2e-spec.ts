import { as } from '../auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { Scenario, seedScenario, SECURITY_ENV, Victim } from './seed';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Probe = [method: Method, url: string, body?: object];

/** Every route that takes the id of a resource in the URL, aimed at the victim's resources. */
function probesByUrl(v: Victim): Probe[] {
  return [
    ['get', `/api/v1/accounts/${v.account.id}`],
    ['patch', `/api/v1/accounts/${v.account.id}`, { name: 'Hackeada' }],
    ['patch', `/api/v1/accounts/${v.account.id}`, { archived: true }],
    [
      'post',
      `/api/v1/accounts/${v.account.id}/pockets`,
      { name: 'Intruso', kind: 'SAVINGS', currency: 'ARS' },
    ],
    ['get', `/api/v1/pockets/${v.ars.id}`],
    ['patch', `/api/v1/pockets/${v.ars.id}`, { name: 'Hackeado' }],
    ['post', `/api/v1/pockets/${v.ars.id}/adjust`, { balance: '0', date: '2026-10-20' }],
    ['get', `/api/v1/pockets/${v.ars.id}/transactions`],
    ['get', `/api/v1/pockets/${v.investment.id}/valuations`],
    ['get', `/api/v1/cards/${v.card.id}`],
    ['patch', `/api/v1/cards/${v.card.id}`, { name: 'Hackeada' }],
    ['get', `/api/v1/cards/${v.card.id}/statements`],
    ['get', `/api/v1/cards/${v.card.id}/installments`],
    [
      'post',
      `/api/v1/cards/${v.card.id}/charges`,
      {
        categoryId: v.expenseCategory.id,
        currency: 'ARS',
        description: 'Intruso',
        date: '2026-10-20',
        totalAmount: '10',
      },
    ],
    ['get', `/api/v1/charges/${v.charge.id}`],
    ['patch', `/api/v1/charges/${v.charge.id}`, { description: 'Hackeado' }],
    ['delete', `/api/v1/charges/${v.charge.id}`],
    ['get', `/api/v1/statements/${v.openStatement.id}`],
    ['get', `/api/v1/statements/${v.closedStatement.id}`],
    ['post', `/api/v1/statements/${v.openStatement.id}/close`, {}],
    [
      'post',
      `/api/v1/statements/${v.closedStatement.id}/payments`,
      { pocketId: v.ars.id, currency: 'ARS', amount: '1', date: '2026-10-20' },
    ],
    ['patch', `/api/v1/categories/${v.category.id}`, { name: 'Hackeada' }],
    ['post', `/api/v1/categories/${v.category.id}/merge`, { targetId: v.expenseCategory.id }],
    ['get', `/api/v1/fixed/${v.fixedId}`],
    ['patch', `/api/v1/fixed/${v.fixedId}`, { paused: true }],
    ['post', `/api/v1/fixed/${v.fixedId}/amounts`, { amount: '1', effectiveFrom: '2026-11' }],
    ['delete', `/api/v1/fixed/${v.fixedId}`],
    ['get', `/api/v1/goals/${v.goalId}`],
    ['patch', `/api/v1/goals/${v.goalId}`, { name: 'Hackeada' }],
    ['get', `/api/v1/goals/${v.goalId}/projection?monthly=500`],
    ['delete', `/api/v1/goals/${v.goalId}`],
    ['delete', `/api/v1/valuations/${v.valuationId}`],
    ['get', `/api/v1/transactions/${v.transactionId}`],
    ['patch', `/api/v1/transactions/${v.transactionId}`, { amount: '1' }],
    ['delete', `/api/v1/transactions/${v.transactionId}`],
    ['get', `/api/v1/transfers/${v.transferId}`],
    ['delete', `/api/v1/transfers/${v.transferId}`],
    ['delete', `/api/v1/auth/identities/${v.identityId}`],
  ];
}

/** Everything B can see of their own data, to check nothing changed after the attacks. */
async function snapshot(ctx: TestContext, v: Victim): Promise<unknown> {
  const api = as(ctx.app, v.user);
  const read = async (url: string) => (await api.get(url).expect(200)).body as unknown;
  return {
    accounts: await read('/api/v1/accounts'),
    pocket: await read(`/api/v1/pockets/${v.ars.id}`),
    movements: await read('/api/v1/movements?limit=100'),
    pending: await read('/api/v1/movements?status=PENDING'),
    cards: await read('/api/v1/cards'),
    charge: await read(`/api/v1/charges/${v.charge.id}`),
    statements: await read(`/api/v1/cards/${v.card.id}/statements?from=2026-09&to=2026-12`),
    categories: await read('/api/v1/categories'),
    fixed: await read('/api/v1/fixed'),
    goals: await read('/api/v1/goals'),
    investments: await read('/api/v1/investments'),
    valuations: await read(`/api/v1/pockets/${v.investment.id}/valuations`),
    identities: await read('/api/v1/auth/identities'),
  };
}

describe('security: authorization between users (IDOR)', () => {
  let ctx: TestContext;
  let s: Scenario;
  let before: unknown;

  const attacker = () => as(ctx.app, s.a.user);
  const send = (probe: Probe) => {
    const [method, url, body] = probe;
    const req = attacker()[method](url);
    return body ? req.send(body) : req;
  };

  beforeAll(async () => {
    ctx = await createTestApp(SECURITY_ENV);
    await resetDatabase(ctx.prisma);
    s = await seedScenario(ctx.app, ctx.prisma);
    before = await snapshot(ctx, s.b);
  });

  afterAll(async () => {
    // B's data is exactly as before every attack of this suite.
    if (s) expect(await snapshot(ctx, s.b)).toEqual(before);
    await ctx.app.close();
  });

  it('SEC-AUTHZ-01 every route by id answers 404 for resources of another user', async () => {
    const leaks: string[] = [];
    for (const probe of probesByUrl(s.b)) {
      const res = await send(probe);
      if (res.status !== 404) leaks.push(`${probe[0].toUpperCase()} ${probe[1]} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('SEC-AUTHZ-01 the same routes work for the owner (the probes are valid requests)', async () => {
    // Only reads: proves a 404 above means "not yours", not "malformed request".
    const owner = as(ctx.app, s.b.user);
    for (const [method, url] of probesByUrl(s.b).filter(([m]) => m === 'get')) {
      await owner[method](url).expect(200);
    }
  });

  it('SEC-AUTHZ-02 list filters pointing at ids of another user never return their data', async () => {
    const b = s.b;
    const urls = [
      `/api/v1/movements?pocketId=${b.ars.id}`,
      `/api/v1/movements?accountId=${b.account.id}`,
      `/api/v1/movements?categoryId=${b.category.id}`,
      `/api/v1/movements?cardId=${b.card.id}`,
      `/api/v1/movements/summary?pocketId=${b.ars.id}`,
      `/api/v1/movements/summary?categoryId=${b.category.id}`,
    ];
    for (const url of urls) {
      const res = await attacker().get(url);
      expect([200, 400, 404], url).toContain(res.status);
      const text = JSON.stringify(res.body);
      for (const id of [b.transactionId, b.transferId, b.pendingId, b.charge.id]) {
        expect(text, url).not.toContain(id);
      }
      expect(text, url).not.toContain('Alimento');
      expect(text, url).not.toContain('Heladera');
    }
  });

  it('SEC-AUTHZ-03 a movement on a pocket or with a category of another user is rejected', async () => {
    const tx = (pocketId: string, categoryId: string) =>
      attacker()
        .post('/api/v1/transactions')
        .send({ type: 'INCOME', pocketId, categoryId, amount: '1000', date: '2026-10-20' });
    const income = (await attacker().get('/api/v1/categories').expect(200)).body.find(
      (c: { kind: string }) => c.kind === 'INCOME',
    );
    expect((await tx(s.b.ars.id, income.id)).status).toBe(404);
    expect((await tx(s.a.ars.id, s.b.category.id)).status).toBe(404);
    // Editing my own movement to point at B's pocket or category.
    await attacker()
      .patch(`/api/v1/transactions/${s.a.transactionId}`)
      .send({ pocketId: s.b.ars.id })
      .expect(404);
    await attacker()
      .patch(`/api/v1/transactions/${s.a.transactionId}`)
      .send({ categoryId: s.b.category.id })
      .expect(404);
    // A charge on my card with B's category.
    await attacker()
      .post(`/api/v1/cards/${s.a.card.id}/charges`)
      .send({
        categoryId: s.b.expenseCategory.id,
        currency: 'ARS',
        description: 'X',
        date: '2026-10-20',
        totalAmount: '10',
      })
      .expect(404);
    await attacker()
      .patch(`/api/v1/charges/${s.a.charge.id}`)
      .send({ categoryId: s.b.expenseCategory.id })
      .expect(404);
    // An own category under a parent of B.
    await attacker()
      .patch(`/api/v1/categories/${s.a.category.id}`)
      .send({ parentId: s.b.expenseCategory.id })
      .expect(404);
    await attacker()
      .post('/api/v1/categories')
      .send({
        name: 'Hija',
        kind: 'EXPENSE',
        icon: 'paw-print',
        color: 'card',
        parentId: s.b.expenseCategory.id,
      })
      .expect(404);
  });

  it('SEC-AUTHZ-04 transfers to or from a pocket of another user are rejected', async () => {
    const transfer = (fromPocketId: string, toPocketId: string) =>
      attacker()
        .post('/api/v1/transfers')
        .send({ fromPocketId, toPocketId, amountOut: '1000', date: '2026-10-20' });
    expect((await transfer(s.a.ars.id, s.b.ars.id)).status).toBe(404);
    expect((await transfer(s.b.ars.id, s.a.ars.id)).status).toBe(404);
    expect((await transfer(s.b.ars.id, s.b.investment.id)).status).toBe(404);
  });

  it('SEC-AUTHZ-05 paying a statement of another user, or mine from their pocket, is rejected', async () => {
    const pay = (statementId: string, pocketId: string) =>
      attacker()
        .post(`/api/v1/statements/${statementId}/payments`)
        .send({ pocketId, currency: 'ARS', amount: '100', date: '2026-10-20' });
    expect((await pay(s.b.closedStatement.id, s.a.ars.id)).status).toBe(404);
    expect((await pay(s.a.closedStatement.id, s.b.ars.id)).status).toBe(404);
    // Closing my statement with an adjustment category of B.
    await attacker()
      .post(`/api/v1/statements/${s.a.openStatement.id}/close`)
      .send({ bankTotalArs: '999999', adjustmentCategoryId: s.b.expenseCategory.id })
      .expect(404);
    // Default payment pocket of my card set to B's pocket.
    await attacker()
      .patch(`/api/v1/cards/${s.a.card.id}`)
      .send({ defaultPaymentPocketId: s.b.ars.id })
      .expect(404);
    await attacker()
      .post('/api/v1/cards')
      .send({ name: 'Otra', closingDay: 30, dueDay: 5, defaultPaymentPocketId: s.b.ars.id })
      .expect(404);
  });

  it('SEC-AUTHZ-06 goals and fixed items cannot point at pockets or categories of another user', async () => {
    await attacker()
      .post('/api/v1/goals')
      .send({
        name: 'Ajena',
        targetAmount: '1000',
        currency: 'USD',
        targetPeriod: '2027-12',
        pocketIds: [s.b.usd.id],
      })
      .expect(404);
    await attacker()
      .patch(`/api/v1/goals/${s.a.goalId}`)
      .send({ pocketIds: [s.a.usd.id, s.b.usd.id] })
      .expect(404);
    const fixed = (pocketId: string, categoryId: string) =>
      attacker().post('/api/v1/fixed').send({
        kind: 'EXPENSE',
        name: 'X',
        categoryId,
        pocketId,
        amount: '1',
        dayOfMonth: 1,
        startPeriod: '2026-10',
      });
    expect((await fixed(s.b.ars.id, s.a.expenseCategory.id)).status).toBe(404);
    expect((await fixed(s.a.ars.id, s.b.expenseCategory.id)).status).toBe(404);
    await attacker()
      .patch(`/api/v1/fixed/${s.a.fixedId}`)
      .send({ pocketId: s.b.ars.id })
      .expect(404);
    await attacker()
      .patch(`/api/v1/fixed/${s.a.fixedId}`)
      .send({ categoryId: s.b.expenseCategory.id })
      .expect(404);
  });

  it('SEC-AUTHZ-07 merging categories across users is rejected', async () => {
    await attacker()
      .post(`/api/v1/categories/${s.a.category.id}/merge`)
      .send({ targetId: s.b.category.id })
      .expect(404);
    await attacker()
      .post(`/api/v1/categories/${s.b.category.id}/merge`)
      .send({ targetId: s.a.category.id })
      .expect(404);
  });

  it('SEC-AUTHZ-08 a valuation batch mixing an own and a foreign pocket saves nothing', async () => {
    const mine = async () =>
      (await attacker().get(`/api/v1/pockets/${s.a.investment.id}/valuations`).expect(200)).body;
    const valuationsBefore = await mine();
    await attacker()
      .post('/api/v1/investments/valuations')
      .send({
        items: [
          { pocketId: s.a.investment.id, date: '2026-10-22', value: '120000' },
          { pocketId: s.b.investment.id, date: '2026-10-22', value: '1' },
        ],
      })
      .expect(404);
    expect(await mine()).toEqual(valuationsBefore);
  });

  it('SEC-AUTHZ-09 a confirm batch with pending movements of another user confirms nothing', async () => {
    const pendingOfA = async () =>
      (await attacker().get('/api/v1/movements?status=PENDING').expect(200)).body.items;
    const pendingBefore = await pendingOfA();
    const res = await attacker()
      .post('/api/v1/transactions/confirm')
      .send({ items: [{ id: s.a.pendingId }, { id: s.b.pendingId }] });
    // Documented behaviour: the whole batch fails with 404.
    expect(res.status).toBe(404);
    expect(await pendingOfA()).toEqual(pendingBefore);
  });

  it('SEC-AUTHZ-10 mass assignment: ownership and computed fields in bodies are ignored', async () => {
    const forged = {
      userId: s.b.user.id,
      id: '00000000-0000-4000-8000-000000000001',
      role: 'ADMIN',
      status: 'SUSPENDED',
      planId: '00000000-0000-4000-8000-000000000002',
      createdAt: '2000-01-01T00:00:00.000Z',
      systemKey: 'ADJUSTMENT',
      baseAmount: '999999999',
      rateToBase: '9999',
      origin: 'VALUATION',
      statusTx: 'CONFIRMED',
    };
    const created = await attacker()
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: s.a.ars.id,
        categoryId: s.a.category.id,
        amount: '10',
        date: '2026-10-20',
        ...forged,
      });
    expect([201, 400]).toContain(created.status);
    if (created.status === 201) {
      expect(created.body.id).not.toBe(forged.id);
      expect(created.body.baseAmount).toBe('10.00');
      expect(created.body.rateToBase).not.toBe('9999');
      expect(created.body.origin).toBe('MANUAL');
      const row = await ctx.prisma.transaction.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(row.userId).toBe(s.a.user.id);
    }

    const category = await attacker()
      .post('/api/v1/categories')
      .send({ name: 'Forjada', kind: 'EXPENSE', icon: 'paw-print', color: 'card', ...forged });
    expect([201, 400]).toContain(category.status);
    if (category.status === 201) {
      const row = await ctx.prisma.category.findUniqueOrThrow({ where: { id: category.body.id } });
      expect(row.userId).toBe(s.a.user.id);
      expect(row.systemKey).toBeNull();
    }

    const profile = await attacker()
      .patch('/api/v1/users/me')
      .send({ name: 'Ana', ...forged });
    expect([200, 400]).toContain(profile.status);
    const me = await ctx.prisma.user.findUniqueOrThrow({ where: { id: s.a.user.id } });
    expect(me).toMatchObject({ role: 'USER', status: 'ACTIVE' });
    expect(me.createdAt.getFullYear()).not.toBe(2000);
  });

  it('SEC-AUTHZ-11 sync and dashboard of A never touch or show B', async () => {
    const pendingOfB = await ctx.prisma.transaction.count({
      where: { userId: s.b.user.id, status: 'PENDING' },
    });
    await attacker().post('/api/v1/sync').expect(200);
    expect(
      await ctx.prisma.transaction.count({ where: { userId: s.b.user.id, status: 'PENDING' } }),
    ).toBe(pendingOfB);
    for (const url of [
      '/api/v1/dashboard',
      '/api/v1/commitments',
      '/api/v1/savings',
      '/api/v1/investments',
      '/api/v1/accounts',
      '/api/v1/cards',
      '/api/v1/goals',
      '/api/v1/fixed',
      '/api/v1/categories',
      '/api/v1/movements?limit=100',
      '/api/v1/auth/identities',
      '/api/v1/me/plan',
    ]) {
      const text = JSON.stringify((await attacker().get(url).expect(200)).body);
      for (const id of [
        s.b.user.id,
        s.b.account.id,
        s.b.ars.id,
        s.b.card.id,
        s.b.goalId,
        s.b.fixedId,
        s.b.category.id,
        s.b.transactionId,
      ]) {
        expect(text, url).not.toContain(id);
      }
      expect(text, url).not.toContain(s.b.user.email);
    }
  });

  it('SEC-AUTHZ-12 malformed, unknown and wrong-type ids answer 400 or 404, never 500', async () => {
    const ids = [
      'not-a-uuid',
      '1',
      '1%27%20OR%201=1--',
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
      s.a.card.id, // a real id of mine, but of another kind of resource
    ];
    const routes = [
      (id: string) => `/api/v1/accounts/${id}`,
      (id: string) => `/api/v1/pockets/${id}`,
      (id: string) => `/api/v1/cards/${id}/statements`,
      (id: string) => `/api/v1/charges/${id}`,
      (id: string) => `/api/v1/statements/${id}`,
      (id: string) => `/api/v1/fixed/${id}`,
      (id: string) => `/api/v1/goals/${id}`,
      (id: string) => `/api/v1/transactions/${id}`,
      (id: string) => `/api/v1/transfers/${id}`,
    ];
    const failures: string[] = [];
    for (const route of routes) {
      for (const id of ids) {
        const url = route(id);
        if (id === s.a.card.id && url.includes('/cards/')) continue;
        const res = await attacker().get(url);
        if (![400, 404].includes(res.status)) failures.push(`GET ${url} -> ${res.status}`);
      }
    }
    for (const id of ids) {
      for (const url of [
        `/api/v1/valuations/${id}`,
        `/api/v1/auth/identities/${id}`,
        `/api/v1/charges/${id}`,
      ]) {
        const res = await attacker().delete(url);
        if (![400, 404].includes(res.status)) failures.push(`DELETE ${url} -> ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
