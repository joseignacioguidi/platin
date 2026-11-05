import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/** DAS-07 on November 5th: "≈ $ 4.079 por día hasta el 30/11". */
describe('dashboard per day', () => {
  let ctx: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-11-05' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('a free amount of $ 106.061,83 on 5/11 is $ 4.079 per day for 26 days', async () => {
    const api = as(ctx.app, user);
    const mp = await createPocket(ctx.app, user, {
      accountName: 'Mercado Pago',
      initialBalance: '100000',
    });
    const salary = await category(ctx.app, user, 'Sueldo');
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'INCOME',
        pocketId: mp.id,
        categoryId: salary.id,
        amount: '6061.83',
        date: '2026-11-02',
      })
      .expect(201);
    const res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      free: '106061.83',
      perDay: '4079.00',
      daysLeft: 26,
      received: '6061.83',
    });
    expect(res.body.accounts).toContainEqual(
      expect.objectContaining({ name: 'Mercado Pago', spendable: '106061.83', toPay: '0.00' }),
    );
  });

  it('a negative free amount has no per day, and the account says what it lacks', async () => {
    const api = as(ctx.app, user);
    const mp = await createPocket(ctx.app, user, {
      accountName: 'Mercado Pago',
      initialBalance: '20000',
    });
    const health = await category(ctx.app, user, 'Salud');
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: mp.id,
        categoryId: health.id,
        amount: '45000',
        date: '2026-11-20',
        description: 'Turno médico',
      })
      .expect(201);
    const res = await api.get('/api/v1/dashboard').expect(200);
    expect(res.body).toMatchObject({
      free: '-25000.00',
      perDay: null,
    });
    // Accounts that pay something come first.
    expect(res.body.accounts[0]).toMatchObject({
      name: 'Mercado Pago',
      spendable: '20000.00',
      toPay: '45000.00',
      shortfall: '25000.00',
      payments: [{ type: 'SCHEDULED', name: 'Turno médico', date: '2026-11-20' }],
    });
  });
});
