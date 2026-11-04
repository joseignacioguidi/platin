import type { Pocket } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

/**
 * Iteration 6 (CTA-02 to 06, MOV-01, 02): incomes, expenses, fixed items and card payments go to
 * an account balance; money gets into and out of a reserve through transfers.
 */
describe('accounts and reserves', () => {
  let ctx: TestContext;
  let user: TestUser;
  let mp: Pocket;
  let previstos: Pocket;
  let auto: Pocket;
  let fci: Pocket;
  let foodId: string;
  const api = () => as(ctx.app, user);
  const code = (res: { body: { code?: string } }) => res.body.code;

  beforeAll(async () => {
    ctx = await createTestApp({ CLOCK_TODAY: '2026-11-04' });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    mp = await createPocket(ctx.app, user, { name: 'Mercado Pago', initialBalance: '500000' });
    previstos = await addPocket(ctx.app, user, mp.accountId, {
      name: 'Gastos Previstos',
      kind: 'SPENDING',
      initialBalance: '100000',
    });
    auto = await addPocket(ctx.app, user, mp.accountId, { name: 'Auto', kind: 'SAVINGS' });
    fci = await addPocket(ctx.app, user, mp.accountId, { name: 'FCI', kind: 'INVESTMENT' });
    foodId = (await category(ctx.app, user, 'Supermercado')).id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const expense = (pocketId: string, date = '2026-11-04') =>
    api().post('/api/v1/transactions').send({
      type: 'EXPENSE',
      pocketId,
      categoryId: foodId,
      amount: '1000',
      date,
    });

  it('incomes, expenses and scheduled ones go to an account balance (ACCOUNT_BALANCE_REQUIRED)', async () => {
    await expense(mp.id).expect(201);
    for (const reserve of [previstos, auto]) {
      const res = await expense(reserve.id).expect(422);
      expect(code(res)).toBe('ACCOUNT_BALANCE_REQUIRED');
    }
    // Scheduled (MOV-08) too.
    expect(code(await expense(auto.id, '2026-11-20').expect(422))).toBe('ACCOUNT_BALANCE_REQUIRED');

    // Editing a movement to a reserve is rejected as well.
    const created = (await expense(mp.id).expect(201)).body;
    const res = await api()
      .patch(`/api/v1/transactions/${created.id}`)
      .send({ pocketId: previstos.id })
      .expect(422);
    expect(code(res)).toBe('ACCOUNT_BALANCE_REQUIRED');
  });

  it('a fixed item goes to an account balance', async () => {
    const rent = await category(ctx.app, user, 'Alquiler');
    const fixed = (pocketId: string) =>
      api().post('/api/v1/fixed').send({
        kind: 'EXPENSE',
        name: 'Alquiler',
        categoryId: rent.id,
        pocketId,
        amount: '380000',
        dayOfMonth: 28,
        startPeriod: '2026-11',
      });
    await fixed(mp.id).expect(201);
    expect(code(await fixed(previstos.id).expect(422))).toBe('ACCOUNT_BALANCE_REQUIRED');
  });

  it('a card is paid from an account balance or a spending reserve (ADR 0024)', async () => {
    const card = (
      await api()
        .post('/api/v1/cards')
        .send({ name: 'Visa', closingDay: 20, dueDay: 5 })
        .expect(201)
    ).body;
    const setPayer = (pocketId: string) =>
      api().patch(`/api/v1/cards/${card.id}`).send({ defaultPaymentPocketId: pocketId });
    await setPayer(mp.id).expect(200);
    await setPayer(previstos.id).expect(200);
    expect(code(await setPayer(auto.id).expect(422))).toBe('ACCOUNT_BALANCE_REQUIRED');

    const other = await category(ctx.app, user, 'Otros gastos');
    await api()
      .post(`/api/v1/cards/${card.id}/charges`)
      .send({
        description: 'Notebook',
        categoryId: other.id,
        totalAmount: '30000',
        currency: 'ARS',
        date: '2026-10-10',
      })
      .expect(201);
    const statements = (await api().get(`/api/v1/cards/${card.id}/statements`).expect(200)).body;
    const october = (statements.items ?? statements).find(
      (s: { period: string }) => s.period === '2026-10',
    );
    await api().post(`/api/v1/statements/${october.id}/close`).send({}).expect(200);
    const pay = (pocketId: string) =>
      api()
        .post(`/api/v1/statements/${october.id}/payments`)
        .send({ pocketId, currency: 'ARS', amount: '10000', date: '2026-11-04' });
    expect(code(await pay(fci.id).expect(422))).toBe('ACCOUNT_BALANCE_REQUIRED');
    await pay(previstos.id).expect(201);
    expect(await balanceOf(ctx.app, user, previstos.id)).toBe('90000.00');
  });

  it('a transfer has an account balance on one end and its intent comes from the pockets', async () => {
    const transfer = (fromPocketId: string, toPocketId: string, intent?: string) =>
      api()
        .post('/api/v1/transfers')
        .send({ fromPocketId, toPocketId, amountOut: '1000', date: '2026-11-04', intent });
    expect((await transfer(mp.id, auto.id).expect(201)).body.intent).toBe('SAVE');
    expect((await transfer(mp.id, fci.id, 'SAVE').expect(201)).body.intent).toBe('INVEST');
    expect((await transfer(auto.id, mp.id).expect(201)).body.intent).toBe('REDEEM');
    expect((await transfer(previstos.id, mp.id).expect(201)).body.intent).toBe('MOVE');
    for (const [from, to] of [
      [previstos.id, auto.id],
      [auto.id, fci.id],
    ]) {
      expect(code(await transfer(from, to).expect(422))).toBe('TRANSFER_NEEDS_ACCOUNT');
    }
  });

  it('one balance per currency (ACCOUNT_BALANCE_EXISTS); another currency adds one', async () => {
    const balance = (currency: string) =>
      api()
        .post(`/api/v1/accounts/${mp.accountId}/pockets`)
        .send({ name: 'Dólares', kind: 'AVAILABLE', currency });
    expect(code(await balance('ARS').expect(409))).toBe('ACCOUNT_BALANCE_EXISTS');
    const usd = (await balance('USD').expect(201)).body;
    expect(usd).toMatchObject({ kind: 'AVAILABLE', currency: 'USD', name: 'Disponible' });
    expect(code(await balance('USD').expect(409))).toBe('ACCOUNT_BALANCE_EXISTS');
  });

  it('a reserve changes its use between spending, savings and investment only', async () => {
    const patch = (id: string, body: Record<string, unknown>) =>
      api().patch(`/api/v1/pockets/${id}`).send(body);
    expect((await patch(previstos.id, { kind: 'SAVINGS' }).expect(200)).body.kind).toBe('SAVINGS');
    expect((await patch(auto.id, { kind: 'SPENDING' }).expect(200)).body.kind).toBe('SPENDING');
    expect(code(await patch(auto.id, { kind: 'AVAILABLE' }).expect(422))).toBe(
      'POCKET_KIND_NOT_ALLOWED',
    );
    expect(code(await patch(mp.id, { kind: 'SPENDING' }).expect(422))).toBe(
      'POCKET_KIND_NOT_ALLOWED',
    );
    // The account balance is not renamed nor archived alone.
    expect(code(await patch(mp.id, { name: 'Otro' }).expect(422))).toBe('ACCOUNT_BALANCE_LOCKED');
    const empty = await createPocket(ctx.app, user, { name: 'Vacía' });
    expect(code(await patch(empty.id, { archived: true }).expect(422))).toBe(
      'ACCOUNT_BALANCE_LOCKED',
    );
  });

  it('a spending reserve can be adjusted; an investment uses a valuation', async () => {
    const adjust = (id: string) =>
      api().post(`/api/v1/pockets/${id}/adjust`).send({ balance: '95000', date: '2026-11-04' });
    await adjust(previstos.id).expect(200);
    expect(await balanceOf(ctx.app, user, previstos.id)).toBe('95000.00');
    expect(code(await adjust(fci.id).expect(422))).toBe('USE_VALUATION');
  });

  it("isolation: another user's account balance is a 404, not a reserve error", async () => {
    const other = await registerUser(ctx.app);
    const food = await category(ctx.app, other, 'Supermercado');
    const res = await as(ctx.app, other)
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: previstos.id,
        categoryId: food.id,
        amount: '1000',
        date: '2026-11-04',
      })
      .expect(404);
    expect(code(res)).not.toBe('ACCOUNT_BALANCE_REQUIRED');
    await as(ctx.app, other)
      .post(`/api/v1/accounts/${mp.accountId}/pockets`)
      .send({ name: 'X', kind: 'AVAILABLE', currency: 'USD' })
      .expect(404);
    await as(ctx.app, other)
      .post('/api/v1/transfers')
      .send({ fromPocketId: auto.id, toPocketId: fci.id, amountOut: '1', date: '2026-11-04' })
      .expect(404);
  });
});
