import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { SUGGESTED_CATEGORIES } from './suggested-categories';

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

  it('every new user starts with the suggested categories', async () => {
    const res = await as(ctx.app, user).get('/api/v1/categories').expect(200);
    expect(res.body).toHaveLength(SUGGESTED_CATEGORIES.length);
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
});
