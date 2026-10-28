import type { Account } from '@platin/contracts';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { addPocket, balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('accounts and pockets', () => {
  let ctx: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const accounts = async (): Promise<{ items: Account[]; totals: { ARS: string; USD: string } }> =>
    (await as(ctx.app, user).get('/api/v1/accounts').expect(200)).body;

  it('every user starts with "Efectivo" and its Disponible in pesos (AUTH-05)', async () => {
    const { items } = await accounts();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Efectivo', kind: 'CASH' });
    expect(items[0].pockets).toEqual([
      expect.objectContaining({
        name: 'Disponible',
        kind: 'AVAILABLE',
        currency: 'ARS',
        balance: '0.00',
      }),
    ]);
  });

  it('an account is born with its Disponible in pesos holding the initial balance (CTA-01/02)', async () => {
    const account = await createAccount(ctx.app, user, {
      name: 'Galicia',
      kind: 'BANK',
      initialBalance: '150000.50',
    });
    expect(account).toMatchObject({ name: 'Galicia', kind: 'BANK', archived: false });
    expect(account.pockets).toEqual([
      expect.objectContaining({
        name: 'Disponible',
        kind: 'AVAILABLE',
        currency: 'ARS',
        accountName: 'Galicia',
        balance: '150000.50',
      }),
    ]);
    expect(account.totals).toEqual({ ARS: '150000.50', USD: '0.00' });
  });

  it('Mercado Pago: one account with pockets in pesos and dollars, and its totals (CTA-03)', async () => {
    const mp = await createAccount(ctx.app, user, {
      name: 'Mercado Pago',
      initialBalance: '120000',
    });
    await addPocket(ctx.app, user, mp.id, {
      name: 'Ahorro',
      kind: 'SAVINGS',
      currency: 'ARS',
      initialBalance: '300000',
    });
    await addPocket(ctx.app, user, mp.id, {
      name: 'Ahorro',
      kind: 'SAVINGS',
      currency: 'USD',
      initialBalance: '1500',
    });
    const investment = await addPocket(ctx.app, user, mp.id, {
      name: 'Inversión largo plazo',
      kind: 'INVESTMENT',
      instrument: 'MUTUAL_FUND',
      initialBalance: '500000',
    });
    expect(investment).toMatchObject({ kind: 'INVESTMENT', instrument: 'MUTUAL_FUND' });

    const { items, totals } = await accounts();
    const account = items.find((a) => a.id === mp.id) as Account;
    expect(account.pockets.map((p) => `${p.name} ${p.currency} ${p.balance}`)).toEqual([
      'Disponible ARS 120000.00',
      'Ahorro ARS 300000.00',
      'Ahorro USD 1500.00',
      'Inversión largo plazo ARS 500000.00',
    ]);
    expect(account.totals).toEqual({ ARS: '920000.00', USD: '1500.00' });
    expect(totals).toEqual({ ARS: '920000.00', USD: '1500.00' });
  });

  it('setting money apart is a transfer between pockets: balances change, nothing is spent (CTA-05)', async () => {
    const mp = await createAccount(ctx.app, user, { initialBalance: '250000' });
    const available = mp.pockets[0];
    const savings = await addPocket(ctx.app, user, mp.id, { name: 'Ahorro' });
    const res = await as(ctx.app, user)
      .post('/api/v1/transfers')
      .send({
        fromPocketId: available.id,
        toPocketId: savings.id,
        amountOut: '100000',
        date: '2026-10-23',
        intent: 'SAVE',
      })
      .expect(201);
    expect(res.body.intent).toBe('SAVE');
    expect(await balanceOf(ctx.app, user, available.id)).toBe('150000.00');
    expect(await balanceOf(ctx.app, user, savings.id)).toBe('100000.00');
    const summary = await as(ctx.app, user)
      .get('/api/v1/movements/summary?period=2026-10')
      .expect(200);
    expect(summary.body.expense).toBe('0.00');
  });

  it('an investment pocket needs its instrument, and only investments have one', async () => {
    const account = await createAccount(ctx.app, user);
    const api = as(ctx.app, user).post(`/api/v1/accounts/${account.id}/pockets`);
    const missing = await api
      .send({ name: 'CEDEARs', kind: 'INVESTMENT', currency: 'USD', instrument: null })
      .expect(400);
    expect(missing.body.errors.map((e: { path: string }) => e.path)).toEqual(['instrument']);
    await as(ctx.app, user)
      .post(`/api/v1/accounts/${account.id}/pockets`)
      .send({ name: 'Auto', kind: 'SAVINGS', currency: 'USD', instrument: 'CEDEAR' })
      .expect(400);
  });

  it('pocket names repeat only in another currency; account names never', async () => {
    const account = await createAccount(ctx.app, user, { name: 'Galicia' });
    await addPocket(ctx.app, user, account.id, { name: 'Ahorro', currency: 'ARS' });
    await addPocket(ctx.app, user, account.id, { name: 'Ahorro', currency: 'USD' });
    const pocket = await as(ctx.app, user)
      .post(`/api/v1/accounts/${account.id}/pockets`)
      .send({ name: 'Ahorro', kind: 'SAVINGS', currency: 'USD' })
      .expect(409);
    expect(pocket.body.code).toBe('POCKET_EXISTS');
    const dup = await as(ctx.app, user)
      .post('/api/v1/accounts')
      .send({ name: 'Galicia', kind: 'BANK' })
      .expect(409);
    expect(dup.body.code).toBe('ACCOUNT_EXISTS');
  });

  it('calculates a pocket balance from confirmed movements only (CTA-04)', async () => {
    const account = await createAccount(ctx.app, user, { initialBalance: '100000' });
    const pocket = account.pockets[0];
    const food = await category(ctx.app, user, 'Supermercado');
    const salary = await category(ctx.app, user, 'Sueldo');
    const api = as(ctx.app, user);
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: pocket.id,
        categoryId: food.id,
        amount: '18500',
        date: '2026-10-23',
      })
      .expect(201);
    await api
      .post('/api/v1/transactions')
      .send({
        type: 'INCOME',
        pocketId: pocket.id,
        categoryId: salary.id,
        amount: '1850000',
        date: '2026-10-20',
      })
      .expect(201);
    // A pending movement doesn't count until it is confirmed.
    await ctx.prisma.transaction.create({
      data: {
        userId: user.id,
        pocketId: pocket.id,
        type: 'EXPENSE',
        status: 'PENDING',
        amount: '380000',
        currency: 'ARS',
        rateToBase: '1',
        baseAmount: '380000',
        date: new Date('2026-10-10'),
      },
    });
    expect(await balanceOf(ctx.app, user, pocket.id)).toBe('1931500.00');

    const movements = await api.get(`/api/v1/pockets/${pocket.id}/transactions`).expect(200);
    expect(movements.body.items).toHaveLength(3);
    expect(movements.body.items[0].pocket).toMatchObject({
      id: pocket.id,
      accountName: account.name,
    });
  });

  it('adjusts a pocket balance with a signed adjustment movement (CTA-06)', async () => {
    const account = await createAccount(ctx.app, user, { initialBalance: '1000' });
    const pocket = account.pockets[0];
    const res = await as(ctx.app, user)
      .post(`/api/v1/pockets/${pocket.id}/adjust`)
      .send({ balance: '850.50', date: '2026-10-23' })
      .expect(200);
    expect(res.body.adjustment).toMatchObject({
      type: 'ADJUSTMENT',
      origin: 'ADJUSTMENT',
      amount: '-149.50',
      baseAmount: '-149.50',
      pocketId: pocket.id,
    });
    expect(await balanceOf(ctx.app, user, pocket.id)).toBe('850.50');

    const same = await as(ctx.app, user)
      .post(`/api/v1/pockets/${pocket.id}/adjust`)
      .send({ balance: '850.50', date: '2026-10-23' })
      .expect(200);
    expect(same.body.adjustment).toBeNull();
  });

  it('values the adjustment of a dollar pocket with the rate of the day or the one sent', async () => {
    const account = await createAccount(ctx.app, user);
    const usd = await addPocket(ctx.app, user, account.id, {
      name: 'Dólares',
      kind: 'AVAILABLE',
      currency: 'USD',
      initialBalance: '100',
    });
    const auto = await as(ctx.app, user)
      .post(`/api/v1/pockets/${usd.id}/adjust`)
      .send({ balance: '110', date: '2026-10-23' })
      .expect(200);
    expect(auto.body.adjustment).toMatchObject({ amount: '10.00', rateToBase: '1200.000000' });
    const ok = await as(ctx.app, user)
      .post(`/api/v1/pockets/${usd.id}/adjust`)
      .send({ balance: '120', date: '2026-10-23', exchangeRate: '1300' })
      .expect(200);
    expect(ok.body.adjustment).toMatchObject({ amount: '10.00', baseAmount: '13000.00' });
  });

  it('archives a pocket only at zero, keeps its history and rejects new movements (CTA-07)', async () => {
    const account = await createAccount(ctx.app, user);
    const savings = await addPocket(ctx.app, user, account.id, {
      name: 'Vacaciones',
      initialBalance: '5000',
    });
    const full = await as(ctx.app, user)
      .patch(`/api/v1/pockets/${savings.id}`)
      .send({ archived: true })
      .expect(422);
    expect(full.body.code).toBe('POCKET_NOT_EMPTY');

    await as(ctx.app, user)
      .post(`/api/v1/pockets/${savings.id}/adjust`)
      .send({ balance: '0', date: '2026-10-23' })
      .expect(200);
    await as(ctx.app, user)
      .patch(`/api/v1/pockets/${savings.id}`)
      .send({ archived: true })
      .expect(200);
    const listed = (await accounts()).items.find((a) => a.id === account.id) as Account;
    expect(listed.pockets.map((p) => p.name)).toEqual(['Disponible']);
    const history = await as(ctx.app, user)
      .get(`/api/v1/pockets/${savings.id}/transactions`)
      .expect(200);
    expect(history.body.items).toHaveLength(1);

    const food = await category(ctx.app, user, 'Supermercado');
    const res = await as(ctx.app, user)
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: savings.id,
        categoryId: food.id,
        amount: '10',
        date: '2026-10-23',
      })
      .expect(422);
    expect(res.body.code).toBe('POCKET_ARCHIVED');
  });

  it('archives an account only when all its pockets are at zero, with its pockets (CTA-07)', async () => {
    const account = await createAccount(ctx.app, user, { initialBalance: '10' });
    const notEmpty = await as(ctx.app, user)
      .patch(`/api/v1/accounts/${account.id}`)
      .send({ archived: true })
      .expect(422);
    expect(notEmpty.body.code).toBe('ACCOUNT_NOT_EMPTY');

    await as(ctx.app, user)
      .post(`/api/v1/pockets/${account.pockets[0].id}/adjust`)
      .send({ balance: '0', date: '2026-10-23' })
      .expect(200);
    const archived = await as(ctx.app, user)
      .patch(`/api/v1/accounts/${account.id}`)
      .send({ archived: true })
      .expect(200);
    expect(archived.body.archived).toBe(true);
    expect(archived.body.pockets.every((p: { archived: boolean }) => p.archived)).toBe(true);
    expect((await accounts()).items.map((a) => a.id)).not.toContain(account.id);
    const all = (await as(ctx.app, user).get('/api/v1/accounts?archived=true').expect(200)).body;
    expect(all.items.map((a: { id: string }) => a.id)).toContain(account.id);
  });

  it('validates the request', async () => {
    const res = await as(ctx.app, user)
      .post('/api/v1/accounts')
      .send({ name: '', kind: 'PIGGY', initialBalance: '1.234' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual([
      'initialBalance',
      'kind',
      'name',
    ]);
  });

  it('isolation: another user gets 404 on every account and pocket route', async () => {
    const account = await createAccount(ctx.app, user);
    const pocket = account.pockets[0];
    const other = await registerUser(ctx.app);
    const api = as(ctx.app, other);
    await api.get(`/api/v1/accounts/${account.id}`).expect(404);
    await api.patch(`/api/v1/accounts/${account.id}`).send({ name: 'Mía' }).expect(404);
    await api
      .post(`/api/v1/accounts/${account.id}/pockets`)
      .send({ name: 'Robado', kind: 'SAVINGS', currency: 'ARS' })
      .expect(404);
    await api.get(`/api/v1/pockets/${pocket.id}`).expect(404);
    await api.patch(`/api/v1/pockets/${pocket.id}`).send({ name: 'Mío' }).expect(404);
    await api.get(`/api/v1/pockets/${pocket.id}/transactions`).expect(404);
    await api
      .post(`/api/v1/pockets/${pocket.id}/adjust`)
      .send({ balance: '1', date: '2026-10-23' })
      .expect(404);
    const theirs = (await api.get('/api/v1/accounts').expect(200)).body.items;
    expect(theirs.map((a: { name: string }) => a.name)).toEqual(['Efectivo']);
  });
});
