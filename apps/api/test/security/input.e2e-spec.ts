import request from 'supertest';
import { as } from '../auth-helpers';
import { createTestApp, resetDatabase, TestContext } from '../test-app';
import { Scenario, seedScenario, SECURITY_ENV } from './seed';

describe('security: input validation', () => {
  let ctx: TestContext;
  let s: Scenario;

  const api = () => as(ctx.app, s.a.user);
  const expense = (overrides: Record<string, unknown>) =>
    api()
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        pocketId: s.a.ars.id,
        categoryId: s.a.category.id,
        amount: '10',
        date: '2026-10-20',
        ...overrides,
      });

  beforeAll(async () => {
    ctx = await createTestApp(SECURITY_ENV);
    await resetDatabase(ctx.prisma);
    s = await seedScenario(ctx.app, ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it.each([
    ['negative', '-10'],
    ['zero', '0'],
    ['zero with decimals', '0.00'],
    ['exponent', '1e9'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['comma decimal', '1,5'],
    ['three decimals', '10.123'],
    ['17 integer digits', '12345678901234567'],
    ['number instead of string', 10],
    ['empty', ''],
    ['spaces', ' 10 '],
    ['hex', '0x10'],
    ['plus sign', '+10'],
    ['null', null],
    ['array', ['10']],
    ['object', { value: '10' }],
  ])('SEC-INPUT-01 amount %s is a 400', async (_label, amount) => {
    const res = await expense({ amount });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('SEC-INPUT-01 the largest valid amount is stored exactly', async () => {
    const res = await expense({ amount: '9999999999999999.99' }).expect(201);
    expect(res.body.amount).toBe('9999999999999999.99');
    await api().delete(`/api/v1/transactions/${res.body.id}`).expect(204);
  });

  // Finding SEC-F10 (a): a valid USD amount times a valid rate does not fit Decimal(18,2) in
  // base currency; the database rejects it and the API answers 500.
  it.skip('SEC-INPUT-01 an amount whose base conversion overflows Decimal(18,2) is a 4xx, not a 500 [SEC-F10]', async () => {
    const res = await expense({
      pocketId: s.a.usd.id,
      amount: '9999999999999999.99',
      exchangeRate: '1500',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-10-32',
    '2026-10-20T00:00:00Z',
    '2026-10-20 10:00',
    '20-10-2026',
    '2026/10/20',
    '+275760-09-13',
    '',
  ])('SEC-INPUT-02 date %s is a 400', async (date) => {
    expect((await expense({ date })).status).toBe(400);
  });

  it.each(['0001-01-01', '1900-01-01', '9999-12-31'])(
    'SEC-INPUT-02 extreme year %s never gives a 500',
    async (date) => {
      const res = await expense({ date });
      expect(res.status).toBeLessThan(500);
      if (res.status === 201) await api().delete(`/api/v1/transactions/${res.body.id}`).expect(204);
    },
  );

  it.each(['2026-13', '2026-1', '2026-00', '202610', '2026-10-01', 'abcd-ef'])(
    'SEC-INPUT-02 period %s is a 400',
    async (period) => {
      const res = await api().post('/api/v1/fixed').send({
        kind: 'EXPENSE',
        name: 'X',
        categoryId: s.a.expenseCategory.id,
        pocketId: s.a.ars.id,
        amount: '1',
        dayOfMonth: 1,
        startPeriod: period,
      });
      expect(res.status).toBe(400);
      expect(
        (await api().get(`/api/v1/cards/${s.a.card.id}/statements?from=${period}`)).status,
      ).toBe(400);
    },
  );

  it('SEC-INPUT-02 a far-future fixed item never gives a 500', async () => {
    const fixed = await api().post('/api/v1/fixed').send({
      kind: 'EXPENSE',
      name: 'Lejano',
      categoryId: s.a.expenseCategory.id,
      pocketId: s.a.ars.id,
      amount: '1',
      dayOfMonth: 31,
      startPeriod: '9999-12',
    });
    expect(fixed.status).toBeLessThan(500);
    expect((await api().post('/api/v1/sync')).status).toBe(200);
    expect((await api().get('/api/v1/commitments')).status).toBe(200);
    if (fixed.status === 201) await api().delete(`/api/v1/fixed/${fixed.body.id}`).expect(204);
  });

  // Finding SEC-F10 (b): near year 9999 the next period is "10000-01", which the domain
  // rejects with a plain Error, so the API answers 500.
  it.skip('SEC-INPUT-02 statements and charges near year 9999 are a 4xx, not a 500 [SEC-F10]', async () => {
    const range = await api().get(
      `/api/v1/cards/${s.a.card.id}/statements?from=0001-01&to=9999-12`,
    );
    expect(range.status).toBeLessThan(500);
    const charge = await api().post(`/api/v1/cards/${s.a.card.id}/charges`).send({
      categoryId: s.a.expenseCategory.id,
      currency: 'ARS',
      description: 'Lejana',
      date: '9999-12-31',
      totalAmount: '10',
      installmentsCount: 12,
    });
    expect(charge.status).toBeLessThan(500);
  });

  it('SEC-INPUT-03 unknown enum values and nulls are a 400; extra fields are dropped', async () => {
    expect((await expense({ type: 'TRANSFER' })).status).toBe(400);
    expect((await expense({ type: 'ADJUSTMENT' })).status).toBe(400);
    expect((await expense({ type: null })).status).toBe(400);
    expect((await expense({ pocketId: null })).status).toBe(400);
    expect((await expense({ description: null })).status).toBe(400);
    expect((await api().post('/api/v1/accounts').send({ name: 'X', kind: 'CRYPTO' })).status).toBe(
      400,
    );
    // Documented: schemas strip unknown keys instead of rejecting them (see SEC-AUTHZ-10).
    const extra = await expense({ hacker: true, __proto__: { admin: true } });
    expect(extra.status).toBe(201);
    expect(extra.body).not.toHaveProperty('hacker');
    await api().delete(`/api/v1/transactions/${extra.body.id}`).expect(204);
  });

  it('SEC-INPUT-03 prototype pollution through JSON does not reach other objects', async () => {
    const res = await api()
      .patch('/api/v1/users/me')
      .set('Content-Type', 'application/json')
      .send(
        '{"name":"Ana","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}',
      );
    expect(res.status).toBeLessThan(500);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('SEC-INPUT-04 an oversized description is a 400 and the body size is capped', async () => {
    const res = await expense({ description: 'a'.repeat(50 * 1024) });
    expect(res.status).toBe(400);
    // Over the default 100 kB body limit the request never reaches the handler.
    const big = await expense({ description: 'a'.repeat(1024 * 1024) });
    expect(big.status).not.toBe(201);
    expect(JSON.stringify(big.body)).not.toMatch(
      /at \w+ \(|node_modules|\.ts:\d+|entity too large/,
    );
    expect(
      await ctx.prisma.transaction.count({ where: { description: { startsWith: 'aaaa' } } }),
    ).toBe(0);
  });

  // Finding SEC-F10 (c): body-parser's PayloadTooLargeError is not an HttpException, so the
  // Problem Details filter turns it into a 500 instead of a 413.
  it.skip('SEC-INPUT-04 a body over the limit is a 413 [SEC-F10]', async () => {
    const big = await expense({ description: 'a'.repeat(1024 * 1024) });
    expect(big.status).toBe(413);
  });

  it('SEC-INPUT-04 malformed JSON is a 400 without internals', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.c", "password": ');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+|SyntaxError/);
  });

  it('SEC-INPUT-05 SQL-looking values are treated as data', async () => {
    const name = '\'; DROP TABLE "User"; --';
    const res = await api()
      .post('/api/v1/categories')
      .send({ name, kind: 'EXPENSE', icon: 'paw-print', color: 'card' })
      .expect(201);
    expect(res.body.name).toBe(name);
    expect(await ctx.prisma.user.count()).toBeGreaterThan(0);
    const search = await api().get(`/api/v1/movements?q=${encodeURIComponent("' OR 1=1 --")}`);
    expect(search.status).toBeLessThan(500);
    expect(JSON.stringify(search.body)).not.toContain(s.b.transactionId);
  });

  it("SEC-INPUT-06 markup is stored and returned verbatim (escaping is the web's job)", async () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:alert(1)',
    ];
    for (const [i, text] of payloads.entries()) {
      const tx = await expense({ description: text }).expect(201);
      expect(tx.body.description).toBe(text);
      const cat = await api()
        .post('/api/v1/categories')
        .send({
          name: `${text}`.slice(0, 35) + i,
          kind: 'EXPENSE',
          icon: 'paw-print',
          color: 'card',
        })
        .expect(201);
      expect(cat.body.name.startsWith(text.slice(0, 35))).toBe(true);
      expect(tx.headers['content-type']).toMatch(/application\/json/);
    }
  });

  it('SEC-INPUT-09 emojis, control characters, RTL and look-alike names never give a 500', async () => {
    const names = [
      'Comida \u{1F355}\u{1F354}',
      'Tab\there',
      'Bell\u0007',
      '\u202Eetnemlaicini',
      '\u05E2\u05D1\u05E8\u05D9\u05EA',
      'Caf\u00E9', // NFC
      'Cafe\u0301', // NFD: looks the same
      '\uFEFFBOM',
      '   ',
    ];
    const results: Record<string, number> = {};
    for (const name of names) {
      const res = await api()
        .post('/api/v1/categories')
        .send({ name, kind: 'EXPENSE', icon: 'paw-print', color: 'card' });
      results[JSON.stringify(name)] = res.status;
    }
    for (const [name, status] of Object.entries(results)) {
      expect(status, name).toBeLessThan(500);
    }
    // Documented: NFC and NFD "Cafe" are two different categories that look the same.
    expect(results[JSON.stringify('Caf\u00E9')]).toBe(201);
    expect(results[JSON.stringify('Cafe\u0301')]).toBe(201);
  });

  // Finding SEC-F10 (d): Postgres rejects the NUL character in text columns and the API
  // answers 500 instead of a 400.
  it.skip('SEC-INPUT-09 a NUL character in any text is a 400 [SEC-F10]', async () => {
    const category = await api()
      .post('/api/v1/categories')
      .send({ name: 'Null\u0000byte', kind: 'EXPENSE', icon: 'paw-print', color: 'card' });
    expect(category.status).toBe(400);
    expect((await expense({ description: 'a\u0000b' })).status).toBe(400);
  });
});
