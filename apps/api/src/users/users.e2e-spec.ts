import { as, registerUser } from '../../test/auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

describe('users', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /users/me returns the profile without secrets', async () => {
    const user = await registerUser(ctx.app, { name: 'José' });
    const res = await as(ctx.app, user).get('/api/v1/users/me').expect(200);
    expect(res.body).toEqual({
      id: user.id,
      email: user.email,
      name: 'José',
      baseCurrency: 'ARS',
      valuationRate: 'MEP',
      role: 'USER',
      preferences: {},
    });
  });

  it('PATCH /users/me saves the home shortcuts and keeps them for other devices (DAS-04)', async () => {
    const user = await registerUser(ctx.app);
    const res = await as(ctx.app, user)
      .patch('/api/v1/users/me')
      .send({ preferences: { homeShortcuts: ['cards', 'accounts', 'investments'] } })
      .expect(200);
    expect(res.body.preferences).toEqual({ homeShortcuts: ['cards', 'accounts', 'investments'] });
    // Another field leaves the preferences alone; an empty list is a valid choice.
    await as(ctx.app, user).patch('/api/v1/users/me').send({ name: 'Otro' }).expect(200);
    const me = await as(ctx.app, user).get('/api/v1/users/me').expect(200);
    expect(me.body.preferences.homeShortcuts).toEqual(['cards', 'accounts', 'investments']);
    const empty = await as(ctx.app, user)
      .patch('/api/v1/users/me')
      .send({ preferences: { homeShortcuts: [] } })
      .expect(200);
    expect(empty.body.preferences).toEqual({ homeShortcuts: [] });
  });

  it.each([
    ['an unknown shortcut', { homeShortcuts: ['accounts', 'casino'] }],
    ['duplicates', { homeShortcuts: ['accounts', 'accounts'] }],
    [
      'more than 8',
      {
        homeShortcuts: [
          'accounts',
          'cards',
          'fixed',
          'commitments',
          'savings',
          'investments',
          'categories',
          'movements',
          'pending',
        ],
      },
    ],
    ['an unknown preference', { theme: 'dark' }],
  ])('PATCH /users/me refuses preferences with %s', async (_case, preferences) => {
    const user = await registerUser(ctx.app);
    const res = await as(ctx.app, user).patch('/api/v1/users/me').send({ preferences }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('PATCH /users/me updates name, base currency and valuation rate', async () => {
    const user = await registerUser(ctx.app);
    const res = await as(ctx.app, user)
      .patch('/api/v1/users/me')
      .send({ name: 'Jose', baseCurrency: 'USD', valuationRate: 'BLUE' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Jose', baseCurrency: 'USD', valuationRate: 'BLUE' });
  });

  it('PATCH /users/me validates enums', async () => {
    const user = await registerUser(ctx.app);
    const res = await as(ctx.app, user)
      .patch('/api/v1/users/me')
      .send({ baseCurrency: 'EUR' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('isolation: each user only sees and edits their own profile', async () => {
    const a = await registerUser(ctx.app, { name: 'A' });
    const b = await registerUser(ctx.app, { name: 'B' });

    // A body or query with another id is ignored: the user comes from the token.
    await as(ctx.app, b).patch('/api/v1/users/me').send({ id: a.id, name: 'Hacked' }).expect(200);
    const aProfile = await as(ctx.app, a).get('/api/v1/users/me').expect(200);
    expect(aProfile.body.name).toBe('A');
    const bProfile = await as(ctx.app, b).get(`/api/v1/users/me?id=${a.id}`).expect(200);
    expect(bProfile.body.id).toBe(b.id);
  });
});
