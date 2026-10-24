import type { Account, Goal } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('goals and savings', () => {
  let ctx: TestContext;
  let user: TestUser;
  let savingsUsd: Account;
  let cashUsd: Account;

  const api = () => as(ctx.app, user);

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-10-23' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    savingsUsd = await createAccount(ctx.app, user, {
      name: 'Caja de ahorro USD',
      type: 'SAVINGS',
      currency: 'USD',
      initialBalance: '3000',
    });
    cashUsd = await createAccount(ctx.app, user, {
      name: 'Efectivo USD',
      type: 'CASH',
      currency: 'USD',
      initialBalance: '1200',
    });
    await createAccount(ctx.app, user, {
      name: 'Mercado Pago remunerada',
      type: 'SAVINGS',
      currency: 'ARS',
      initialBalance: '3710000',
    });
    await createAccount(ctx.app, user, { name: 'Galicia', type: 'BANK', initialBalance: '500000' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /** The car from the specification: USD 15.000 for December 2027, created in January 2026. */
  async function car(): Promise<Goal> {
    const created = (
      await api()
        .post('/api/v1/goals')
        .send({
          name: 'Auto',
          targetAmount: '15000',
          currency: 'USD',
          targetPeriod: '2027-12',
          accountIds: [savingsUsd.id, cashUsd.id],
        })
        .expect(201)
    ).body as Goal;
    await ctx.prisma.goal.update({
      where: { id: created.id },
      data: { createdAt: new Date('2026-01-10T15:00:00Z') },
    });
    return (await api().get(`/api/v1/goals/${created.id}`).expect(200)).body;
  }

  it('the car goal: 28 %, USD 10.800 to go and USD 771,43 per month (MET-01/03)', async () => {
    const goal = await car();
    expect(goal).toMatchObject({
      name: 'Auto',
      currency: 'USD',
      targetPeriod: '2027-12',
      startPeriod: '2026-01',
      status: 'ACTIVE',
    });
    expect(goal.accounts.map((a) => a.balanceInGoalCurrency)).toEqual(['3000.00', '1200.00']);
    expect(goal.projection).toMatchObject({
      accumulated: '4200.00',
      remaining: '10800.00',
      progress: '0.2800',
      monthsLeft: 14,
      monthlyNeeded: '771.43',
      expectedToDate: '5625.00',
      pace: 'BEHIND',
      paceDifference: '1425.00',
    });
  });

  it('with USD 900 per month it is reached in October 2027, 2 months early (MET-04)', async () => {
    const goal = await car();
    const res = await api().get(`/api/v1/goals/${goal.id}/projection?monthly=900`).expect(200);
    expect(res.body.simulation).toEqual({
      monthly: '900.00',
      monthsNeeded: 12,
      reachedIn: '2027-10',
      monthsBeforeTarget: 2,
    });
  });

  it('a goal in pesos linked to a dollar account converts with the preferred rate', async () => {
    const res = await api()
      .post('/api/v1/goals')
      .send({
        name: 'Mudanza',
        targetAmount: '6000000',
        currency: 'ARS',
        targetPeriod: '2027-06',
        accountIds: [savingsUsd.id],
      })
      .expect(201);
    // USD 3.000 × MEP 1.200
    expect(res.body.projection.accumulated).toBe('3600000.00');
  });

  it('without linked accounts it adds assigned contributions (MET-02)', async () => {
    const goal = (
      await api()
        .post('/api/v1/goals')
        .send({
          name: 'Vacaciones',
          targetAmount: '2000000',
          currency: 'ARS',
          targetPeriod: '2027-02',
        })
        .expect(201)
    ).body;
    await api()
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .send({ amount: '1500000', date: '2026-10-01' })
      .expect(201);
    const res = await api()
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .send({ amount: '-300000', date: '2026-10-20' })
      .expect(201);
    expect(res.body.projection.accumulated).toBe('1200000.00');
    expect(res.body.contributions).toHaveLength(2);
    await api()
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .send({ amount: '0', date: '2026-10-20' })
      .expect(400);
  });

  it('links and unlinks accounts and marks a goal as achieved (MET-05)', async () => {
    const goal = await car();
    const unlinked = await api()
      .patch(`/api/v1/goals/${goal.id}`)
      .send({ accountIds: [cashUsd.id] })
      .expect(200);
    expect(unlinked.body.projection.accumulated).toBe('1200.00');
    const achieved = await api()
      .patch(`/api/v1/goals/${goal.id}`)
      .send({ status: 'ACHIEVED' })
      .expect(200);
    expect(achieved.body.status).toBe('ACHIEVED');
  });

  it('total saved in USD: savings accounts and cash in dollars, with the preferred rate', async () => {
    const res = await api().get('/api/v1/savings').expect(200);
    expect(res.body).toMatchObject({
      rate: { type: 'MEP', sell: '1200.000000' },
      usd: '4200.00',
      ars: '3710000.00',
      arsInUsd: '3091.67',
      totalUsd: '7291.67',
      totalArs: '8750000.00',
    });
    expect(res.body.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Caja de ahorro USD',
      'Efectivo USD',
      'Mercado Pago remunerada',
    ]);
  });

  it('isolation: goals of another user are invisible; my accounts cannot be linked by others', async () => {
    const goal = await car();
    const other = await registerUser(ctx.app);
    const theirs = as(ctx.app, other);
    await theirs.get(`/api/v1/goals/${goal.id}`).expect(404);
    await theirs.patch(`/api/v1/goals/${goal.id}`).send({ status: 'CANCELLED' }).expect(404);
    await theirs.get(`/api/v1/goals/${goal.id}/projection?monthly=900`).expect(404);
    await theirs
      .post(`/api/v1/goals/${goal.id}/contributions`)
      .send({ amount: '1', date: '2026-10-01' })
      .expect(404);
    await theirs
      .post('/api/v1/goals')
      .send({
        name: 'Robo',
        targetAmount: '1',
        currency: 'USD',
        targetPeriod: '2027-01',
        accountIds: [savingsUsd.id],
      })
      .expect(404);
    expect((await theirs.get('/api/v1/goals').expect(200)).body).toEqual([]);
    expect((await theirs.get('/api/v1/savings').expect(200)).body.accounts).toEqual([]);
  });
});
