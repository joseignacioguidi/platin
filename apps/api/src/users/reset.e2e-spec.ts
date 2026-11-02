import type { DataSummary } from '@platin/contracts';
import request from 'supertest';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

const PASSWORD = 'una-clave-segura';

describe('start over (AUTH-09)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app, { name: 'Ana' });
    other = await registerUser(ctx.app, { name: 'Beto' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  /** Money, a card, a goal and a custom category with a subcategory, for one user. */
  async function fill(owner: TestUser): Promise<void> {
    const pocket = await createPocket(ctx.app, owner, { initialBalance: '5000' });
    const food = await category(ctx.app, owner, 'Supermercado');
    const send = (url: string, body: object) => as(ctx.app, owner).post(url).send(body).expect(201);
    await send('/api/v1/transactions', {
      type: 'EXPENSE',
      pocketId: pocket.id,
      categoryId: food.id,
      amount: '100',
      date: '2026-10-23',
    });
    await send('/api/v1/cards', { name: 'Visa', closingDay: 20, dueDay: 5 });
    await send('/api/v1/goals', {
      name: 'Viaje',
      targetAmount: '1000',
      currency: 'ARS',
      targetPeriod: '2027-12',
      pocketIds: [pocket.id],
    });
    const custom = await send('/api/v1/categories', {
      name: 'Mascotas',
      kind: 'EXPENSE',
      icon: 'paw-print',
      color: 'expense',
    });
    await send('/api/v1/categories', {
      name: 'Veterinaria',
      kind: 'EXPENSE',
      icon: 'paw-print',
      color: 'expense',
      parentId: custom.body.id,
    });
  }

  const reset = (who: TestUser, body: object) =>
    as(ctx.app, who).post('/api/v1/users/me/reset').send(body);
  const owned = (who: TestUser) =>
    Promise.all([
      ctx.prisma.account.count({ where: { userId: who.id } }),
      ctx.prisma.transaction.count({ where: { userId: who.id } }),
      ctx.prisma.creditCard.count({ where: { userId: who.id } }),
      ctx.prisma.goal.count({ where: { userId: who.id } }),
      ctx.prisma.category.count({ where: { userId: who.id } }),
    ]);

  it('GET /users/me/data-summary counts what would be deleted', async () => {
    await fill(user);
    const res = await as(ctx.app, user).get('/api/v1/users/me/data-summary').expect(200);
    const summary = res.body as DataSummary;
    expect(summary).toMatchObject({ transactions: 1, cards: 1, goals: 1 });
    expect(summary.accounts).toBeGreaterThanOrEqual(1);
    expect(summary.categories).toBeGreaterThan(2);
  });

  it('deletes everything and keeps the categories when asked', async () => {
    await fill(user);
    const before = await ctx.prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    await reset(user, {
      confirmEmail: user.email.toUpperCase(),
      password: PASSWORD,
      keepCategories: true,
    }).expect(200);

    expect(await ctx.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.creditCard.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.goal.count({ where: { userId: user.id } })).toBe(0);
    const accounts = await ctx.prisma.account.findMany({
      where: { userId: user.id },
      include: { pockets: true },
    });
    expect(accounts.map((a) => a.name)).toEqual(['Efectivo']);
    expect(accounts[0].pockets).toHaveLength(1);
    const after = await ctx.prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    expect(after).toEqual(before);
  });

  it('without keepCategories only the suggested and system categories remain', async () => {
    await fill(user);
    await reset(user, {
      confirmEmail: user.email,
      password: PASSWORD,
      keepCategories: false,
    }).expect(200);
    const names = (
      await ctx.prisma.category.findMany({ where: { userId: user.id }, select: { name: true } })
    ).map((c) => c.name);
    expect(names).not.toContain('Mascotas');
    expect(names).not.toContain('Veterinaria');
    expect(names).toContain('Supermercado');
    expect(names.filter((name) => name === 'Ajustes')).toHaveLength(1);
  });

  it('a wrong email or password deletes nothing', async () => {
    await fill(user);
    const before = await owned(user);
    const email = await reset(user, {
      confirmEmail: 'otra@test.platin',
      password: PASSWORD,
      keepCategories: true,
    }).expect(400);
    expect(email.body.code).toBe('CONFIRMATION_MISMATCH');
    const wrong = await reset(user, {
      confirmEmail: user.email,
      password: 'incorrecta-123',
      keepCategories: true,
    }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    const missing = await reset(user, { confirmEmail: user.email, keepCategories: true }).expect(
      401,
    );
    expect(missing.body.code).toBe('INVALID_CREDENTIALS');
    expect(await owned(user)).toEqual(before);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'user.reset' } })).toBe(0);
  });

  it('an account that only signs in with Google confirms with the email alone', async () => {
    await fill(user);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });
    await ctx.prisma.authIdentity.create({
      data: { userId: user.id, provider: 'GOOGLE', providerUserId: 'sub-1', email: user.email },
    });
    await reset(user, { confirmEmail: user.email, keepCategories: true }).expect(200);
    expect(await ctx.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.authIdentity.count({ where: { userId: user.id } })).toBe(1);
  });

  it('keeps the session, plan, preferences and sign-in methods, and audits it', async () => {
    await fill(user);
    await as(ctx.app, user)
      .patch('/api/v1/users/me')
      .send({ preferences: { homeShortcuts: ['cards'] } })
      .expect(200);
    const plan = await ctx.prisma.userPlan.findMany({ where: { userId: user.id } });
    const summary = await as(ctx.app, user).get('/api/v1/users/me/data-summary').expect(200);

    await reset(user, {
      confirmEmail: user.email,
      password: PASSWORD,
      keepCategories: true,
    }).expect(200);

    const me = await as(ctx.app, user).get('/api/v1/users/me').expect(200);
    expect(me.body.preferences).toEqual({ homeShortcuts: ['cards'] });
    expect(await ctx.prisma.userPlan.findMany({ where: { userId: user.id } })).toEqual(plan);
    expect(
      await ctx.prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } }),
    ).toBe(1);
    const logs = await ctx.prisma.auditLog.findMany({ where: { action: 'user.reset' } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: user.id, targetUserId: user.id });
    expect(logs[0].payload).toEqual({ keepCategories: true, counts: summary.body });
  });

  it('does not touch the data of another user', async () => {
    await fill(user);
    await fill(other);
    const before = await owned(other);
    await reset(user, {
      confirmEmail: user.email,
      password: PASSWORD,
      keepCategories: false,
    }).expect(200);
    expect(await owned(other)).toEqual(before);
    // The other user's email never works for this one.
    await reset(user, {
      confirmEmail: other.email,
      password: PASSWORD,
      keepCategories: true,
    }).expect(400);
  });

  it('requires a session', async () => {
    const server = ctx.app.getHttpServer();
    await request(server).post('/api/v1/users/me/reset').send({}).expect(401);
    await request(server).get('/api/v1/users/me/data-summary').expect(401);
  });
});
