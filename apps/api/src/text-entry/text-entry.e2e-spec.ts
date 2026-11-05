import type { Account, Card, MerchantRule, TextEntryContextResponse } from '@platin/contracts';
import { DEFAULT_MERCHANT_RULES } from '@platin/domain';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';

const ADMIN_EMAIL = 'admin@test.platin';

describe('text entry (TXT-01 to 04)', () => {
  let ctx: TestContext;
  let user: TestUser;
  let other: TestUser;

  const api = (who: TestUser = user) => as(ctx.app, who);

  beforeAll(async () => {
    ctx = await createTestApp({ ADMIN_EMAILS: ADMIN_EMAIL });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    user = await registerUser(ctx.app);
    other = await registerUser(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function card(who: TestUser = user, name = 'Visa'): Promise<Card> {
    const res = await api(who).post('/api/v1/cards').send({ name, closingDay: 20, dueDay: 5 });
    return res.body;
  }

  describe('aliases (TXT-02)', () => {
    it('puts the aliases of an account and a card, normalized, and shows them', async () => {
      const mp = await createAccount(ctx.app, user, { name: 'Mercado Pago' });
      const visa = await card();
      const put = await api()
        .put(`/api/v1/accounts/${mp.id}/aliases`)
        .send({ aliases: ['MP', ' Mercado ', 'mp', 'Mércado Pago'] })
        .expect(200);
      expect(put.body).toEqual({ aliases: ['mercado', 'mercadopago', 'mp'] });
      await api().put(`/api/v1/cards/${visa.id}/aliases`).send({ aliases: ['visa'] }).expect(200);

      const account = (await api().get(`/api/v1/accounts/${mp.id}`).expect(200)).body as Account;
      expect(account.aliases).toEqual(['mercado', 'mercadopago', 'mp']);
      const cards = (await api().get('/api/v1/cards').expect(200)).body as Card[];
      expect(cards[0].aliases).toEqual(['visa']);

      // Replacing removes the old ones.
      await api().put(`/api/v1/accounts/${mp.id}/aliases`).send({ aliases: ['mp'] }).expect(200);
      expect((await api().get(`/api/v1/accounts/${mp.id}`)).body.aliases).toEqual(['mp']);
    });

    it('an alias is unique per user: ALIAS_TAKEN', async () => {
      const mp = await createAccount(ctx.app, user, { name: 'Mercado Pago' });
      const visa = await card();
      await api().put(`/api/v1/accounts/${mp.id}/aliases`).send({ aliases: ['mp'] }).expect(200);
      const taken = await api()
        .put(`/api/v1/cards/${visa.id}/aliases`)
        .send({ aliases: ['visa', 'MP'] })
        .expect(409);
      expect(taken.body.code).toBe('ALIAS_TAKEN');
      expect((await api().get('/api/v1/cards')).body[0].aliases).toEqual([]);

      // Another user can use the same alias.
      const theirs = await createAccount(ctx.app, other);
      await api(other)
        .put(`/api/v1/accounts/${theirs.id}/aliases`)
        .send({ aliases: ['mp'] })
        .expect(200);
    });

    it('rejects words the parser reads as something else, numbers and symbols', async () => {
      const mp = await createAccount(ctx.app, user);
      for (const alias of ['usd', 'hoy', '3c', 'mil', '123', 'a/b', '']) {
        await api().put(`/api/v1/accounts/${mp.id}/aliases`).send({ aliases: [alias] }).expect(400);
      }
    });

    it('isolation: aliases of another user account or card are 404', async () => {
      const theirs = await createAccount(ctx.app, other);
      const theirCard = await card(other);
      await api().put(`/api/v1/accounts/${theirs.id}/aliases`).send({ aliases: ['otra'] }).expect(404);
      await api().put(`/api/v1/cards/${theirCard.id}/aliases`).send({ aliases: ['otra'] }).expect(404);
      expect(await ctx.prisma.sourceAlias.count()).toBe(0);
    });
  });

  describe('merchant rules (TXT-03)', () => {
    it('creates, edits and deletes a rule', async () => {
      const supermarket = await category(ctx.app, user, 'Supermercado');
      const outings = await category(ctx.app, user, 'Salidas');
      const created = await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: '  Cóto ', categoryId: supermarket.id })
        .expect(201);
      expect(created.body).toMatchObject({
        pattern: 'coto',
        categoryId: supermarket.id,
        createdVia: 'APP',
      });
      const dup = await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'COTO', categoryId: outings.id })
        .expect(409);
      expect(dup.body.code).toBe('RULE_EXISTS');

      await api()
        .patch(`/api/v1/merchant-rules/${created.body.id}`)
        .send({ pattern: 'coto digital', categoryId: outings.id })
        .expect(200);
      const list = (await api().get('/api/v1/merchant-rules').expect(200)).body as MerchantRule[];
      expect(list).toEqual([
        expect.objectContaining({ pattern: 'coto digital', categoryId: outings.id }),
      ]);
      await api().delete(`/api/v1/merchant-rules/${created.body.id}`).expect(204);
      expect((await api().get('/api/v1/merchant-rules')).body).toEqual([]);
    });

    it('only for categories of the user that can be chosen', async () => {
      const adjustments = await category(ctx.app, user, 'Ajustes');
      const theirs = await category(ctx.app, other, 'Supermercado');
      const system = await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'ajuste', categoryId: adjustments.id })
        .expect(409);
      expect(system.body.code).toBe('CATEGORY_SYSTEM');
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'coto', categoryId: theirs.id })
        .expect(404);
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'x', categoryId: theirs.id })
        .expect(400);
    });

    it('isolation: rules of another user are invisible and not editable', async () => {
      const theirCategory = await category(ctx.app, other, 'Supermercado');
      const mine = await category(ctx.app, user, 'Supermercado');
      const theirs = await api(other)
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'coto', categoryId: theirCategory.id })
        .expect(201);
      expect((await api().get('/api/v1/merchant-rules')).body).toEqual([]);
      await api()
        .patch(`/api/v1/merchant-rules/${theirs.body.id}`)
        .send({ categoryId: mine.id })
        .expect(404);
      await api().delete(`/api/v1/merchant-rules/${theirs.body.id}`).expect(404);
      // And the same pattern is free for this user.
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'coto', categoryId: mine.id })
        .expect(201);
    });

    it('merging a category moves its rules', async () => {
      const outings = await category(ctx.app, user, 'Salidas');
      const delivery = await category(ctx.app, user, 'Delivery');
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'rappi', categoryId: delivery.id })
        .expect(201);
      await api()
        .post(`/api/v1/categories/${delivery.id}/merge`)
        .send({ targetId: outings.id })
        .expect(200);
      const [rule] = (await api().get('/api/v1/merchant-rules')).body as MerchantRule[];
      expect(rule.categoryId).toBe(outings.id);
    });
  });

  describe('context (TXT-01)', () => {
    it('returns aliases of active accounts and cards, rules, global rules and the last source', async () => {
      const mp = await createAccount(ctx.app, user, { name: 'Mercado Pago' });
      const old = await createAccount(ctx.app, user, { name: 'Vieja' });
      const visa = await card();
      const supermarket = await category(ctx.app, user, 'Supermercado');
      await api().put(`/api/v1/accounts/${mp.id}/aliases`).send({ aliases: ['mp'] });
      await api().put(`/api/v1/accounts/${old.id}/aliases`).send({ aliases: ['vieja'] });
      await api().put(`/api/v1/cards/${visa.id}/aliases`).send({ aliases: ['visa'] });
      await api().patch(`/api/v1/accounts/${old.id}`).send({ archived: true }).expect(200);
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'coto', categoryId: supermarket.id })
        .expect(201);

      let res = await api().get('/api/v1/text-entry/context').expect(200);
      let body = res.body as TextEntryContextResponse;
      expect(body.aliases).toEqual([
        { alias: 'mp', source: { kind: 'ACCOUNT', id: mp.id } },
        { alias: 'visa', source: { kind: 'CARD', id: visa.id } },
      ]);
      expect(body.rules).toEqual([{ pattern: 'coto', categoryId: supermarket.id }]);
      expect(body.globalRules).toHaveLength(DEFAULT_MERCHANT_RULES.length);
      expect(body.lastUsed).toBeNull();

      const balance = mp.pockets[0];
      await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: balance.id,
          categoryId: supermarket.id,
          amount: '100',
          date: '2026-10-23',
        })
        .expect(201);
      body = (await api().get('/api/v1/text-entry/context')).body;
      expect(body.lastUsed).toEqual({ kind: 'ACCOUNT', id: mp.id });

      await api()
        .post(`/api/v1/cards/${visa.id}/charges`)
        .send({
          description: 'Zapatillas',
          categoryId: supermarket.id,
          totalAmount: '9000',
          currency: 'ARS',
          date: '2026-10-23',
          installmentsCount: 1,
        })
        .expect(201);
      res = await api().get('/api/v1/text-entry/context');
      expect(res.body.lastUsed).toEqual({ kind: 'CARD', id: visa.id });

      // Nothing of this user reaches another one.
      const theirs = (await api(other).get('/api/v1/text-entry/context')).body;
      expect(theirs).toMatchObject({ aliases: [], rules: [], lastUsed: null });
    });
  });

  describe('global rules (TXT-04, ADM-05)', () => {
    it('the admin reads and replaces them; the context follows', async () => {
      const admin = await registerUser(ctx.app, { email: ADMIN_EMAIL });
      const res = await api(admin).get('/api/v1/admin/settings/merchant-rules').expect(200);
      expect(res.body.value.rules).toHaveLength(35);
      expect(res.body.value.rules).toContainEqual({ pattern: 'ypf', categoryName: 'Nafta' });

      await api(admin)
        .put('/api/v1/admin/settings/merchant-rules')
        .send({ value: { rules: [{ pattern: ' Kiosco ', categoryName: 'Otros gastos' }] } })
        .expect(200);
      const context = (await api().get('/api/v1/text-entry/context')).body;
      expect(context.globalRules).toEqual([{ pattern: 'kiosco', categoryName: 'Otros gastos' }]);

      const dup = await api(admin)
        .put('/api/v1/admin/settings/merchant-rules')
        .send({ value: { rules: [{ pattern: 'a b', categoryName: 'X' }, { pattern: 'A  B', categoryName: 'Y' }] } })
        .expect(400);
      expect(dup.body.code).toBe('VALIDATION_FAILED');
      await api().get('/api/v1/admin/settings/merchant-rules').expect(403);
    });
  });
});
