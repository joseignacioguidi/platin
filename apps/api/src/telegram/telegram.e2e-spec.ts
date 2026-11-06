import type { Movement } from '@platin/contracts';
import { dateParts, localDateAt } from '@platin/domain';
import request from 'supertest';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { FakeTelegramClient } from '../../test/fake-telegram';
import { category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext } from '../../test/test-app';
import { TELEGRAM_SECRET_HEADER } from './telegram.controller';

const SECRET = 'test-webhook-secret-with-at-least-32-chars';
const ADMIN_EMAIL = 'admin-bot@test.platin';
// A new chat per test: the rate limit is per chat and lives in memory.
let ANA = 1000;
let BETO = 500_000;

describe('Telegram bot (BOT-01 to 06)', () => {
  let ctx: TestContext;
  let telegram: FakeTelegramClient;
  let user: TestUser;
  let updateId = 1;

  const api = (who: TestUser = user) => as(ctx.app, who);
  const hook = (body: object, secret = SECRET) =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/telegram/webhook')
      .set(TELEGRAM_SECRET_HEADER, secret)
      .send(body);
  const message = (chat: number, text: string, id = updateId++) =>
    hook({
      update_id: id,
      message: {
        message_id: id,
        from: { id: chat, first_name: 'Ana' },
        chat: { id: chat, type: 'private' },
        text,
      },
    }).expect(200);
  const tap = (chat: number, data: string, id = updateId++) =>
    hook({
      update_id: id,
      callback_query: {
        id: `cb${id}`,
        from: { id: chat },
        data,
        message: { message_id: 1, chat: { id: chat, type: 'private' } },
      },
    }).expect(200);

  async function link(who: TestUser, chat: number): Promise<void> {
    const res = await api(who).post('/api/v1/telegram/link-code').expect(201);
    await message(chat, `/start ${res.body.code}`);
  }

  beforeAll(async () => {
    telegram = new FakeTelegramClient();
    ctx = await createTestApp(
      {
        TELEGRAM_BOT_TOKEN: '123:fake',
        TELEGRAM_BOT_USERNAME: 'platin_test_bot',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
        TELEGRAM_CODE_PEPPER: 'test-code-pepper-with-at-least-32-chars',
        ADMIN_EMAILS: ADMIN_EMAIL,
      },
      { telegramClient: telegram },
    );
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    telegram.reset();
    ANA += 1;
    BETO += 1;
    user = await registerUser(ctx.app, { name: 'Ana' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('webhook security', () => {
    it('an invalid secret is 401 and changes nothing', async () => {
      await hook({ update_id: 1 }, 'wrong').expect(401);
      await request(ctx.app.getHttpServer()).post('/api/v1/telegram/webhook').send({}).expect(401);
      expect(await ctx.prisma.telegramUpdate.count()).toBe(0);
    });

    it('a repeated update is processed once', async () => {
      await message(ANA, 'hola', 77);
      await message(ANA, 'hola', 77);
      expect(telegram.messages).toHaveLength(1);
    });

    it('an unlinked chat gets the instructions; groups get nothing', async () => {
      await message(ANA, 'café 3500');
      expect(telegram.last(ANA).text).toContain('no está vinculado a platin');
      await hook({
        update_id: updateId++,
        message: {
          message_id: 1,
          from: { id: ANA },
          chat: { id: -5, type: 'group' },
          text: 'café 3500',
        },
      }).expect(200);
      expect(telegram.messages).toHaveLength(1);
    });
  });

  describe('linking', () => {
    it('links with the link code, welcomes and shows the link in the profile', async () => {
      const status = await api().get('/api/v1/telegram/link').expect(200);
      expect(status.body).toEqual({ enabled: true, botUsername: 'platin_test_bot', link: null });
      const code = await api().post('/api/v1/telegram/link-code').expect(201);
      expect(code.body.url).toBe(`https://t.me/platin_test_bot?start=${code.body.code}`);
      await message(ANA, `/start ${code.body.code}`);
      expect(telegram.last(ANA).text).toContain('¡Listo, Ana!');
      const linked = await api().get('/api/v1/telegram/link').expect(200);
      expect(linked.body.link).toMatchObject({ firstName: 'Ana' });
      // Only the hash is stored.
      const stored = await ctx.prisma.telegramLinkCode.findFirstOrThrow();
      expect(stored.codeHash).not.toContain(code.body.code);
    });

    it('a code works once, expires after 10 minutes and /vincular works too', async () => {
      const code = (await api().post('/api/v1/telegram/link-code')).body.code as string;
      await message(ANA, `/vincular ${code.toLowerCase()}`);
      expect(telegram.last(ANA).text).toContain('¡Listo');
      await message(BETO, `/start ${code}`);
      expect(telegram.last(BETO).text).toContain('Ese código ya no sirve');

      const other = await registerUser(ctx.app);
      const late = (await api(other).post('/api/v1/telegram/link-code')).body.code as string;
      await ctx.prisma.telegramLinkCode.updateMany({
        where: { userId: other.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await message(BETO, `/start ${late}`);
      expect(telegram.last(BETO).text).toContain('Ese código ya no sirve');
      expect(await ctx.prisma.telegramLink.count({ where: { userId: other.id } })).toBe(0);
    });

    it('linking the same Telegram to another account replaces the previous link', async () => {
      await link(user, ANA);
      const other = await registerUser(ctx.app, { name: 'Otra' });
      await link(other, ANA);
      expect(telegram.last(ANA).text).toContain('estaba vinculado a otra cuenta');
      expect((await api().get('/api/v1/telegram/link')).body.link).toBeNull();
    });

    it('unlinking from the profile or with /desvincular stops the chat', async () => {
      await link(user, ANA);
      await api().delete('/api/v1/telegram/link').expect(204);
      await message(ANA, 'café 3500');
      expect(telegram.last(ANA).text).toContain('no está vinculado');
      await link(user, ANA);
      await message(ANA, '/desvincular');
      expect(telegram.last(ANA).text).toContain('desvinculé');
      expect(await ctx.prisma.telegramLink.count()).toBe(0);
    });

    it('a suspended user cannot link nor load', async () => {
      await link(user, ANA);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      await message(ANA, 'café 3500');
      expect(telegram.last(ANA).text).toBe('Tu cuenta de platin está suspendida.');
      expect(await ctx.prisma.botDraft.count()).toBe(0);
    });
  });

  describe('drafts (BOT-02 to 04)', () => {
    beforeEach(async () => {
      await link(user, ANA);
      telegram.reset();
    });

    it('"café 3500": a draft, confirm once, and it shows in the app as entered by Telegram', async () => {
      const cafe = await category(ctx.app, user, 'Salidas');
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'cafe', categoryId: cafe.id })
        .expect(201);
      await message(ANA, 'café 3500');
      const draft = telegram.last(ANA);
      expect(draft.text).toBe('Gasto · $ 3.500 · Salidas · Efectivo · hoy');
      expect(draft.buttons.map((b) => b.text)).toEqual([
        'Confirmar',
        'Cambiar categoría',
        'Cambiar cuenta',
        'Cancelar',
      ]);
      const confirm = telegram.button(ANA, 'Confirmar');
      await tap(ANA, confirm);
      expect(telegram.messages.map((m) => m.text)).toContainEqual(
        expect.stringMatching(/^Guardado ✓ Te quedan/),
      );
      await tap(ANA, confirm);
      expect(telegram.answers.at(-1)?.text).toBe('Ya estaba guardado.');

      const res = await api().get('/api/v1/movements').expect(200);
      const items = res.body.items as Movement[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        kind: 'TRANSACTION',
        channel: 'TELEGRAM',
        amount: '3500.00',
        description: 'café',
      });
    });

    it('a card purchase in installments, with the alias', async () => {
      const visa = (
        await api().post('/api/v1/cards').send({ name: 'Visa', closingDay: 20, dueDay: 5 })
      ).body;
      await api()
        .put(`/api/v1/cards/${visa.id}/aliases`)
        .send({ aliases: ['visa'] })
        .expect(200);
      await message(ANA, 'super 45k visa 3c');
      expect(telegram.last(ANA).text).toBe(
        'Gasto · $ 45.000 · Supermercado · Visa · 3 cuotas de $ 15.000 · hoy',
      );
      await tap(ANA, telegram.button(ANA, 'Confirmar'));
      const charge = await ctx.prisma.cardCharge.findFirstOrThrow();
      expect(charge).toMatchObject({ channel: 'TELEGRAM', installmentsCount: 3 });
    });

    it('without a category: no Confirmar until one is chosen; then it offers the rule', async () => {
      await message(ANA, 'plomero 12000');
      expect(telegram.last(ANA).text).toContain('Sin categoría: elegí una antes de confirmar.');
      expect(telegram.last(ANA).buttons.map((b) => b.text)).not.toContain('Confirmar');

      await tap(ANA, telegram.button(ANA, 'Cambiar categoría'));
      expect(telegram.last(ANA).text).toBe('Elegí la categoría:');
      await tap(ANA, telegram.button(ANA, 'Supermercado'));
      expect(telegram.messages.map((m) => m.text)).toContain(
        '¿La próxima vez <b>plomero</b> va a Supermercado?',
      );
      await tap(ANA, telegram.button(ANA, 'Sí'));
      const rule = await ctx.prisma.merchantRule.findFirstOrThrow({ where: { userId: user.id } });
      expect(rule).toMatchObject({ pattern: 'plomero', createdVia: 'TELEGRAM' });

      await message(ANA, 'plomero 9000');
      expect(telegram.last(ANA).text).toContain('Supermercado');
    });

    it('"Otra" asks for the name and creates the category if it does not exist', async () => {
      await message(ANA, 'veterinaria 20000');
      await tap(ANA, telegram.button(ANA, 'Cambiar categoría'));
      await tap(ANA, telegram.button(ANA, 'Otra'));
      expect(telegram.last(ANA).text).toBe('Escribí el nombre de la categoría.');
      await message(ANA, 'Mascotas');
      expect(telegram.messages.map((m) => m.text)).toContainEqual(
        expect.stringContaining('Gasto · $ 20.000 · Mascotas'),
      );
      expect(
        await ctx.prisma.category.count({ where: { userId: user.id, name: 'Mascotas' } }),
      ).toBe(1);
    });

    it('changing the account and cancelling', async () => {
      const mp = await createAccount(ctx.app, user, { name: 'Mercado Pago' });
      const food = await category(ctx.app, user, 'Supermercado');
      void food;
      await message(ANA, 'super 5000');
      await tap(ANA, telegram.button(ANA, 'Cambiar cuenta'));
      await tap(ANA, telegram.button(ANA, 'Mercado Pago'));
      expect(telegram.last(ANA).text).toContain('Mercado Pago');
      await tap(ANA, telegram.button(ANA, 'Cancelar'));
      expect(telegram.last(ANA).text).toBe('Listo, no guardé nada.');
      expect(await ctx.prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
      void mp;
    });

    const today = dateParts(localDateAt(new Date()));
    it.skipIf(today.day >= 28)('an ambiguous date asks; the coming one is scheduled', async () => {
      const day = today.day + 1;
      await message(ANA, `turno médico el ${day} 15000`);
      expect(telegram.last(ANA).text).toBe(`¿Qué ${day}?`);
      await tap(ANA, telegram.button(ANA, `${day}/${today.month} · programar`));
      expect(telegram.last(ANA).text).toContain(`Programado para el ${day}/${today.month}`);
      await tap(ANA, telegram.button(ANA, 'Cambiar categoría'));
      await tap(ANA, telegram.button(ANA, 'Otra'));
      await message(ANA, 'salud');
      await tap(ANA, telegram.button(ANA, 'Confirmar'));
      const row = await ctx.prisma.transaction.findFirstOrThrow({ where: { userId: user.id } });
      expect(row).toMatchObject({ origin: 'SCHEDULED', status: 'PENDING', channel: 'TELEGRAM' });
    });

    it('an expired draft and a draft of another chat are answered as expired', async () => {
      await message(ANA, 'café 3500');
      const cancel = telegram.button(ANA, 'Cancelar');
      // The chat of B cannot touch the draft of A.
      const other = await registerUser(ctx.app);
      await link(other, BETO);
      await tap(BETO, cancel);
      expect(telegram.answers.at(-1)?.text).toBe('Este borrador venció. Mandalo de nuevo.');
      expect(
        (await ctx.prisma.botDraft.findFirstOrThrow({ where: { userId: user.id } })).status,
      ).toBe('OPEN');

      await ctx.prisma.botDraft.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await tap(ANA, cancel);
      expect(telegram.answers.at(-1)?.text).toBe('Este borrador venció. Mandalo de nuevo.');
    });

    it('an error is answered with its text and kept as unparsed (BOT-06)', async () => {
      await message(ANA, 'heladera 900000 3c');
      expect(telegram.last(ANA).text).toBe(
        'Las cuotas van con tarjeta. Agregá cuál, por ejemplo <b>visa 3c</b>.',
      );
      await message(ANA, 'hola');
      expect(telegram.last(ANA).text).toContain('No encontré el monto');

      const list = await api().get('/api/v1/telegram/unparsed').expect(200);
      expect(list.body.map((m: { error: string }) => m.error)).toEqual([
        'NO_AMOUNT',
        'INSTALLMENTS_WITHOUT_CARD',
      ]);
      await api().delete(`/api/v1/telegram/unparsed/${list.body[0].id}`).expect(204);
      const other = await registerUser(ctx.app);
      await api(other).delete(`/api/v1/telegram/unparsed/${list.body[1].id}`).expect(404);
      expect(
        await api(other)
          .get('/api/v1/telegram/unparsed')
          .then((r) => r.body),
      ).toEqual([]);
      await api().delete('/api/v1/telegram/unparsed').expect(204);
      expect((await api().get('/api/v1/telegram/unparsed')).body).toEqual([]);
    });

    it('rate limit: 30 messages per minute per chat', async () => {
      for (let i = 0; i < 31; i++) await message(ANA, '/ayuda');
      expect(telegram.last(ANA).text).toBe('Vas muy rápido. Esperá un minuto.');
    });
  });

  describe('commands (BOT-05)', () => {
    beforeEach(async () => {
      await link(user, ANA);
      telegram.reset();
    });

    it('/libre, /hoy, /ayuda', async () => {
      await message(ANA, '/libre');
      expect(telegram.last(ANA).text).toMatch(/^Te quedan \$ .* para gastar este mes/);
      await message(ANA, '/hoy');
      expect(telegram.last(ANA).text).toBe('Hoy todavía no cargaste nada.');
      await message(ANA, 'café 3500');
      await tap(ANA, telegram.button(ANA, 'Cambiar categoría'));
      await tap(ANA, telegram.button(ANA, 'Salidas'));
      await tap(ANA, telegram.button(ANA, 'Confirmar'));
      await message(ANA, '/hoy');
      expect(telegram.last(ANA).text).toBe(
        'Hoy cargaste:\n• $ 3.500 · café\nTotal gastado: $ 3.500',
      );
      await message(ANA, '/ayuda@platin_test_bot');
      expect(telegram.last(ANA).text).toContain('Escribime el gasto en una línea');
    });

    it('/pendientes confirms a pending movement; /proximos lists payments', async () => {
      const account = (await api().get('/api/v1/accounts')).body.items[0];
      const rent = await category(ctx.app, user, 'Alquiler');
      await api()
        .post('/api/v1/fixed')
        .send({
          kind: 'EXPENSE',
          name: 'Alquiler',
          categoryId: rent.id,
          pocketId: account.pockets[0].id,
          currency: 'ARS',
          amount: '300000',
          dayOfMonth: 1,
          startPeriod: localDateAt(new Date()).slice(0, 7),
        })
        .expect(201);
      await api().post('/api/v1/sync').expect(200);
      await message(ANA, '/pendientes');
      expect(telegram.last(ANA).text).toContain('Para confirmar:');
      await tap(ANA, telegram.button(ANA, 'Confirmar: Alquiler'));
      expect(telegram.last(ANA).text).toBe('Confirmado ✓ Alquiler');
      const row = await ctx.prisma.transaction.findFirstOrThrow({ where: { userId: user.id } });
      expect(row.status).toBe('CONFIRMED');
      await message(ANA, '/proximos');
      expect(telegram.last(ANA).text).toMatch(/^Próximos pagos:|^No tenés pagos/);
    });

    it('/deshacer deletes only the last one of the bot, and not a charge in a closed statement', async () => {
      await message(ANA, '/deshacer');
      expect(telegram.last(ANA).text).toBe(
        'No hay nada cargado desde acá en las últimas 24 horas.',
      );
      await message(ANA, 'café 3500');
      await tap(ANA, telegram.button(ANA, 'Cambiar categoría'));
      await tap(ANA, telegram.button(ANA, 'Salidas'));
      await tap(ANA, telegram.button(ANA, 'Confirmar'));
      // One from the app does not count.
      const account = (await api().get('/api/v1/accounts')).body.items[0];
      const food = await category(ctx.app, user, 'Supermercado');
      await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: account.pockets[0].id,
          categoryId: food.id,
          amount: '10',
          date: localDateAt(new Date()),
        })
        .expect(201);
      await message(ANA, '/deshacer');
      expect(telegram.last(ANA).text).toMatch(/^¿Borro el gasto de \$ 3\.500 \(café\)/);
      await tap(ANA, telegram.button(ANA, 'Sí, borrar'));
      expect(telegram.last(ANA).text).toBe('Listo, lo borré.');
      expect(await ctx.prisma.transaction.count({ where: { userId: user.id } })).toBe(1);

      const visa = (
        await api().post('/api/v1/cards').send({ name: 'Visa', closingDay: 20, dueDay: 5 })
      ).body;
      await api()
        .put(`/api/v1/cards/${visa.id}/aliases`)
        .send({ aliases: ['visa'] });
      await message(ANA, 'super 45k visa');
      await tap(ANA, telegram.button(ANA, 'Confirmar'));
      await ctx.prisma.cardStatement.updateMany({ data: { status: 'CLOSED' } });
      await message(ANA, '/deshacer');
      expect(telegram.last(ANA).text).toBe(
        'No se puede: ese consumo ya tiene una cuota en un resumen cerrado.',
      );
    });
  });

  describe('admin and cleanup', () => {
    it('metrics count users with Telegram and messages, never their content', async () => {
      await link(user, ANA);
      await message(ANA, 'hola');
      const admin = await registerUser(ctx.app, { email: ADMIN_EMAIL });
      const metrics = (await api(admin).get('/api/v1/admin/metrics').expect(200)).body;
      expect(metrics.featureUsage.telegram).toBe(1);
      expect(metrics.bot.unparsedShareLast30Days).toBe(100);
      expect(metrics.bot.messagesByWeek.at(-1).count).toBe(1);
      expect(JSON.stringify(metrics)).not.toContain('hola');
    });

    it('POST /sync removes expired drafts and old updates', async () => {
      await link(user, ANA);
      await message(ANA, 'café 3500');
      await ctx.prisma.botDraft.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await ctx.prisma.telegramUpdate.updateMany({
        data: { receivedAt: new Date(Date.now() - 4 * 86_400_000) },
      });
      await api().post('/api/v1/sync').expect(200);
      expect(await ctx.prisma.botDraft.count()).toBe(0);
      expect(await ctx.prisma.telegramUpdate.count()).toBe(0);
    });
  });
});

describe('Telegram bot disabled', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_SECRET: '' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('the profile says so and the webhook does not exist', async () => {
    await resetDatabase(ctx.prisma);
    const user = await registerUser(ctx.app);
    const res = await as(ctx.app, user).get('/api/v1/telegram/link').expect(200);
    expect(res.body).toEqual({ enabled: false, botUsername: null, link: null });
    await as(ctx.app, user).post('/api/v1/telegram/link-code').expect(404);
    await request(ctx.app.getHttpServer()).post('/api/v1/telegram/webhook').send({}).expect(404);
  });
});
