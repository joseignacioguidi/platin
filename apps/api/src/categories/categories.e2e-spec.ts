import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createPocket } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { SUGGESTED_CATEGORIES, SYSTEM_CATEGORIES } from './suggested-categories';

describe('categories', () => {
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

  it('every new user starts with the suggested and system categories', async () => {
    const res = await as(ctx.app, user).get('/api/v1/categories').expect(200);
    expect(res.body).toHaveLength(SUGGESTED_CATEGORIES.length + SYSTEM_CATEGORIES.length);
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: 'Ajustes', systemKey: 'ADJUSTMENT', kind: 'EXPENSE' }),
    );
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: 'Rendimientos', systemKey: 'YIELD', kind: 'INCOME' }),
    );
    expect(res.body).toContainEqual(
      expect.objectContaining({ name: 'Supermercado', kind: 'EXPENSE', icon: 'shopping-cart' }),
    );
    expect(res.body).toContainEqual(expect.objectContaining({ name: 'Sueldo', kind: 'INCOME' }));
  });

  it('creates, renames and archives a category', async () => {
    const api = as(ctx.app, user);
    const created = await api
      .post('/api/v1/categories')
      .send({ name: 'Mascotas', kind: 'EXPENSE', icon: 'paw-print', color: 'card' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Mascotas', parentId: null, archived: false });

    await api.patch(`/api/v1/categories/${created.body.id}`).send({ name: 'Perro' }).expect(200);
    await api.patch(`/api/v1/categories/${created.body.id}`).send({ archived: true }).expect(200);
    const list = await api.get('/api/v1/categories').expect(200);
    expect(list.body.find((c: { id: string }) => c.id === created.body.id)).toBeUndefined();
  });

  it('rejects duplicated names of the same kind, raw colors and bad icons', async () => {
    const api = as(ctx.app, user);
    const dup = await api
      .post('/api/v1/categories')
      .send({ name: 'Supermercado', kind: 'EXPENSE', icon: 'cart', color: 'expense' })
      .expect(409);
    expect(dup.body.code).toBe('CATEGORY_EXISTS');
    await api
      .post('/api/v1/categories')
      .send({ name: 'X', kind: 'EXPENSE', icon: 'cart', color: '#FF0000' })
      .expect(400);
    await api
      .post('/api/v1/categories')
      .send({ name: 'X', kind: 'EXPENSE', icon: '<svg>', color: 'card' })
      .expect(400);
  });

  it('isolation: categories of another user are invisible and not editable', async () => {
    const other = await registerUser(ctx.app);
    const mine = await as(ctx.app, user)
      .post('/api/v1/categories')
      .send({ name: 'Privada', kind: 'EXPENSE', icon: 'lock', color: 'muted' })
      .expect(201);
    await as(ctx.app, other)
      .patch(`/api/v1/categories/${mine.body.id}`)
      .send({ name: 'Robada' })
      .expect(404);
    const theirs = await as(ctx.app, other).get('/api/v1/categories').expect(200);
    expect(theirs.body.map((c: { name: string }) => c.name)).not.toContain('Privada');
  });

  it('CAT-05: system categories cannot be edited, archived or merged', async () => {
    const api = as(ctx.app, user);
    const adjustments = await category(ctx.app, user, 'Ajustes');
    const other = await category(ctx.app, user, 'Otros gastos');
    for (const body of [{ name: 'X' }, { archived: true }, { icon: 'tag' }]) {
      const res = await api.patch(`/api/v1/categories/${adjustments.id}`).send(body).expect(409);
      expect(res.body.code).toBe('CATEGORY_SYSTEM');
    }
    await api
      .post(`/api/v1/categories/${adjustments.id}/merge`)
      .send({ targetId: other.id })
      .expect(409);
  });

  it('a balance adjustment uses the Ajustes category', async () => {
    const api = as(ctx.app, user);
    const account = await createPocket(ctx.app, user, { initialBalance: '1000' });
    const res = await api
      .post(`/api/v1/pockets/${account.id}/adjust`)
      .send({ balance: '900', date: '2026-10-20' })
      .expect(200);
    const adjustments = await category(ctx.app, user, 'Ajustes');
    expect(res.body.adjustment.categoryId).toBe(adjustments.id);
  });

  it('CAT-02: subcategories have a top-level parent of the same kind', async () => {
    const api = as(ctx.app, user);
    const food = await category(ctx.app, user, 'Salidas');
    const salary = await category(ctx.app, user, 'Sueldo');
    const child = await api
      .post('/api/v1/categories')
      .send({ name: 'Cafés', kind: 'EXPENSE', icon: 'coffee', color: 'expense', parentId: food.id })
      .expect(201);
    expect(child.body.parentId).toBe(food.id);
    const wrongKind = await api
      .post('/api/v1/categories')
      .send({ name: 'Bono', kind: 'EXPENSE', icon: 'tag', color: 'brand', parentId: salary.id })
      .expect(422);
    expect(wrongKind.body.code).toBe('CATEGORY_KIND_MISMATCH');
    const nested = await api
      .post('/api/v1/categories')
      .send({
        name: 'Cortado',
        kind: 'EXPENSE',
        icon: 'coffee',
        color: 'expense',
        parentId: child.body.id,
      })
      .expect(422);
    expect(nested.body.code).toBe('CATEGORY_INVALID_PARENT');
    // Back to top level.
    const moved = await api
      .patch(`/api/v1/categories/${child.body.id}`)
      .send({ parentId: null })
      .expect(200);
    expect(moved.body.parentId).toBeNull();
  });

  it('CAT-04: merging moves movements, charges and fixed items and archives the source', async () => {
    const api = as(ctx.app, user);
    const account = await createPocket(ctx.app, user);
    const delivery = await category(ctx.app, user, 'Delivery');
    const outings = await category(ctx.app, user, 'Salidas');
    for (const amount of ['1000', '2000']) {
      await api
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: account.id,
          categoryId: delivery.id,
          amount,
          date: '2026-10-20',
        })
        .expect(201);
    }
    const card = (
      await api.post('/api/v1/cards').send({ name: 'Visa', closingDay: 30, dueDay: 5 }).expect(201)
    ).body;
    const charge = (
      await api
        .post(`/api/v1/cards/${card.id}/charges`)
        .send({
          categoryId: delivery.id,
          currency: 'ARS',
          description: 'Pedidos',
          totalAmount: '3000',
          date: '2026-10-21',
        })
        .expect(201)
    ).body;
    await api
      .post('/api/v1/fixed')
      .send({
        kind: 'EXPENSE',
        name: 'Club',
        categoryId: delivery.id,
        pocketId: account.id,
        amount: '500',
        dayOfMonth: 5,
        startPeriod: '2026-10',
      })
      .expect(201);
    const sub = (
      await api
        .post('/api/v1/categories')
        .send({
          name: 'Pizza',
          kind: 'EXPENSE',
          icon: 'pizza',
          color: 'expense',
          parentId: delivery.id,
        })
        .expect(201)
    ).body;

    const usage = (await api.get('/api/v1/categories?usage=true').expect(200)).body as {
      id: string;
      usageCount: number;
    }[];
    expect(usage.find((c) => c.id === delivery.id)?.usageCount).toBe(4);

    const merged = await api
      .post(`/api/v1/categories/${delivery.id}/merge`)
      .send({ targetId: outings.id })
      .expect(200);
    expect(merged.body).toMatchObject({ moved: 4, target: { id: outings.id } });

    const all = (await api.get('/api/v1/categories?archived=true&usage=true').expect(200)).body as {
      id: string;
      archived: boolean;
      parentId: string | null;
      usageCount: number;
    }[];
    expect(all.find((c) => c.id === delivery.id)).toMatchObject({ archived: true, usageCount: 0 });
    expect(all.find((c) => c.id === outings.id)?.usageCount).toBe(4);
    expect(all.find((c) => c.id === sub.id)?.parentId).toBe(outings.id);
    const movedCharge = (await api.get(`/api/v1/charges/${charge.id}`).expect(200)).body;
    expect(movedCharge.categoryId).toBe(outings.id);
  });

  it('CAT-04: only into another category of the same kind', async () => {
    const api = as(ctx.app, user);
    const delivery = await category(ctx.app, user, 'Delivery');
    const salary = await category(ctx.app, user, 'Sueldo');
    const merge = (targetId: string) =>
      api.post(`/api/v1/categories/${delivery.id}/merge`).send({ targetId });
    const kind = await merge(salary.id).expect(422);
    expect(kind.body.code).toBe('CATEGORY_KIND_MISMATCH');
    const same = await merge(delivery.id).expect(422);
    expect(same.body.code).toBe('CATEGORY_MERGE_SAME');
  });

  it('isolation: cannot merge into or from categories of another user', async () => {
    const other = await registerUser(ctx.app);
    const mine = await category(ctx.app, user, 'Delivery');
    const theirs = await category(ctx.app, other, 'Salidas');
    await as(ctx.app, user)
      .post(`/api/v1/categories/${mine.id}/merge`)
      .send({ targetId: theirs.id })
      .expect(404);
    await as(ctx.app, other)
      .post(`/api/v1/categories/${mine.id}/merge`)
      .send({ targetId: theirs.id })
      .expect(404);
  });
});
