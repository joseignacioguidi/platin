import type { Account, FeedsResponse, Movement, StatementSummary } from '@platin/contracts';
import type { ExternalMovementInput, LocalDate } from '@platin/domain';
import request from 'supertest';
import { as, registerUser, TestUser } from '../../test/auth-helpers';
import { FAKE_SIGNATURE, FakeFeedProvider } from '../../test/fake-feed';
import { addPocket, balanceOf, category, createAccount } from '../../test/fixtures';
import { createTestApp, resetDatabase, TestContext, UNLIMITED } from '../../test/test-app';

const APP = 'http://app.test';
const TODAY = '2026-11-24';
const YESTERDAY = '2026-11-23';
const ENV = {
  CLOCK_TODAY: TODAY,
  PUBLIC_APP_URL: APP,
  OAUTH_COOKIE_SECRET: 'test-oauth-cookie-secret-with-32-chars-or-more',
  FEED_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const BASE = '/api/v1/feeds/mercado-pago';
const ANA_MP = '1001';
const BETO_MP = '2002';

type SetCookie = string | string[] | undefined;

function cookieFrom(setCookie: SetCookie, name: string): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.find((value) => value.startsWith(`${name}=`))?.split(';')[0] ?? '';
}

let externalIds = 0;
function payment(overrides: Partial<ExternalMovementInput> = {}): ExternalMovementInput {
  externalIds += 1;
  return {
    externalId: `pay-${externalIds}`,
    kind: 'EXPENSE',
    amount: '3500.00',
    currency: 'ARS',
    date: YESTERDAY as LocalDate,
    occurredAt: `${YESTERDAY}T13:00:00.000Z`,
    description: 'Café Martínez',
    ...overrides,
  };
}

describe('Mercado Pago connection (MPG-01 to 10)', () => {
  let ctx: TestContext;
  let mp: FakeFeedProvider;
  let ana: TestUser;
  let wallet: Account;
  let requestIds = 0;

  const http = () => request(ctx.app.getHttpServer());
  const api = (who: TestUser = ana) => as(ctx.app, who);

  /** "Conectar": POST /connect (feed_tx cookie), the institution's page, and the callback. */
  async function authorize(who: TestUser, externalUserId: string) {
    const res = await api(who).post(`${BASE}/connect`).expect(200);
    const state = new URL(res.body.authorizationUrl).searchParams.get('state') ?? '';
    return {
      state,
      cookie: cookieFrom(res.headers['set-cookie'], 'feed_tx'),
      code: mp.code(state, externalUserId),
    };
  }

  async function callback(state: string, code: string, cookie?: string) {
    const req = http().get(`${BASE}/callback?code=${code}&state=${state}`);
    if (cookie) req.set('Cookie', cookie);
    const res = await req.expect(302);
    return new URL(res.headers['location']);
  }

  async function connect(who: TestUser, externalUserId: string): Promise<URL> {
    const { state, cookie, code } = await authorize(who, externalUserId);
    return callback(state, code, cookie);
  }

  /** Connected and with its wallet chosen. */
  async function setup(who: TestUser, externalUserId: string, account?: Account): Promise<Account> {
    await connect(who, externalUserId);
    const chosen =
      account ??
      (await createAccount(ctx.app, who, { name: 'Mercado Pago', initialBalance: '100000' }));
    await api(who).patch(BASE).send({ accountId: chosen.id }).expect(204);
    return chosen;
  }

  /** A signed notice of a payment; `id` is the resource the fake answers for. */
  function notify(
    externalUserId: string,
    id: string,
    options: { requestId?: string; signature?: string; type?: string } = {},
  ) {
    return http()
      .post(`${BASE}/webhook?data.id=${id}&type=payment`)
      .set('x-signature', options.signature ?? FAKE_SIGNATURE)
      .set('x-request-id', options.requestId ?? `req-${++requestIds}`)
      .send({
        type: options.type ?? 'payment',
        action: 'payment.created',
        user_id: externalUserId,
        data: { id },
      });
  }

  /** Registers what the institution reports for a resource and sends its notice. */
  async function arrive(movements: ExternalMovementInput[], externalUserId = ANA_MP) {
    const id = `res-${++requestIds}`;
    mp.resources.set(id, movements);
    await notify(externalUserId, id).expect(200);
    return id;
  }

  const movements = async (who: TestUser = ana, query = ''): Promise<Movement[]> =>
    (await api(who).get(`/api/v1/movements${query}`).expect(200)).body.items;
  const feeds = async (who: TestUser = ana): Promise<FeedsResponse['providers'][number]> =>
    ((await api(who).get('/api/v1/feeds').expect(200)).body as FeedsResponse).providers[0];
  const externalOf = (externalId: string) =>
    ctx.prisma.externalMovement.findFirst({ where: { externalId } });

  async function setFreeLimit(limit: number | null) {
    await ctx.prisma.plan.update({
      where: { key: 'free' },
      data: { limits: { ...UNLIMITED, maxFeedMovementsPerDay: limit } },
    });
  }

  beforeAll(async () => {
    mp = new FakeFeedProvider();
    ctx = await createTestApp(ENV, { feedProviders: [mp] });
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    mp.reset();
    ana = await registerUser(ctx.app);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('conectar (MPG-01)', () => {
    it('sin conexión: el proveedor habilitado, sin límite y sin uso', async () => {
      expect(await feeds()).toMatchObject({
        provider: 'MERCADO_PAGO',
        slug: 'mercado-pago',
        connection: null,
        usage: { day: TODAY, created: 0, overLimit: 0, limit: null },
      });
    });

    it('autoriza, vuelve al perfil y pide elegir la cuenta (una billetera)', async () => {
      const back = await connect(ana, ANA_MP);
      expect(`${back.origin}${back.pathname}`).toBe(`${APP}/app/perfil/mercado-pago`);
      expect(back.searchParams.get('conectado')).toBe('1');
      expect((await feeds()).connection).toMatchObject({ status: 'NEEDS_ACCOUNT', account: null });

      const bank = await createAccount(ctx.app, ana, { name: 'Santander', kind: 'BANK' });
      const wrong = await api().patch(BASE).send({ accountId: bank.id }).expect(422);
      expect(wrong.body.code).toBe('FEED_ACCOUNT_KIND');

      const mpAccount = await createAccount(ctx.app, ana, { name: 'Mercado Pago' });
      await api().patch(BASE).send({ accountId: mpAccount.id }).expect(204);
      expect((await feeds()).connection).toMatchObject({
        status: 'ACTIVE',
        account: { id: mpAccount.id, name: 'Mercado Pago' },
      });
      // The credentials are stored encrypted, never as received.
      const row = await ctx.prisma.feedConnection.findFirstOrThrow({ where: { userId: ana.id } });
      expect(Buffer.from(row.accessTokenEnc as Uint8Array).toString('utf8')).not.toContain(
        'access-',
      );
    });

    it('un enlace con la cookie de otra sesión no conecta nada', async () => {
      const beto = await registerUser(ctx.app);
      const victim = await authorize(ana, ANA_MP);
      const attacker = await authorize(beto, BETO_MP);
      // Ana's code and state, with Beto's cookie (and the other way around): nothing connects.
      const mixed = await callback(victim.state, victim.code, attacker.cookie);
      expect(mixed.searchParams.get('error')).toBe('FEED_STATE_MISMATCH');
      const none = await callback(attacker.state, attacker.code);
      expect(none.searchParams.get('error')).toBe('FEED_STATE_MISMATCH');
      expect(await ctx.prisma.feedConnection.count()).toBe(0);
    });

    it('una cookie alterada no se acepta', async () => {
      const { state, code, cookie } = await authorize(ana, ANA_MP);
      const tampered = cookie.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
      const back = await callback(state, code, tampered);
      expect(back.searchParams.get('error')).toBe('FEED_STATE_MISMATCH');
    });

    it('una cuenta de Mercado Pago ya conectada a otro usuario da FEED_ACCOUNT_TAKEN', async () => {
      await connect(ana, ANA_MP);
      const beto = await registerUser(ctx.app);
      const back = await connect(beto, ANA_MP);
      expect(back.searchParams.get('error')).toBe('FEED_ACCOUNT_TAKEN');
      expect(await ctx.prisma.feedConnection.count({ where: { userId: beto.id } })).toBe(0);
    });

    it('si la persona cancela en Mercado Pago, vuelve con el error', async () => {
      const { cookie } = await authorize(ana, ANA_MP);
      const res = await http()
        .get(`${BASE}/callback?error=access_denied`)
        .set('Cookie', cookie)
        .expect(302);
      expect(new URL(res.headers['location']).searchParams.get('error')).toBe('FEED_DENIED');
    });

    it('un proveedor que no está habilitado da 404', async () => {
      const res = await api().post('/api/v1/feeds/uala/connect').expect(404);
      expect(res.body.code).toBe('FEED_PROVIDER_DISABLED');
    });
  });

  describe('movimientos al instante (MPG-02 a 04)', () => {
    beforeEach(async () => {
      wallet = await setup(ana, ANA_MP);
    });

    it('un café con QR entra confirmado, con su categoría por la regla y cambia el saldo', async () => {
      const salidas = await category(ctx.app, ana, 'Salidas');
      await api()
        .post('/api/v1/merchant-rules')
        .send({ pattern: 'cafe', categoryId: salidas.id })
        .expect(201);
      await arrive([payment()]);

      const [coffee] = await movements();
      expect(coffee).toMatchObject({
        kind: 'TRANSACTION',
        type: 'EXPENSE',
        status: 'CONFIRMED',
        channel: 'MERCADO_PAGO',
        amount: '3500.00',
        date: YESTERDAY,
        description: 'Café Martínez',
        category: { id: salidas.id },
        external: { provider: 'MERCADO_PAGO', status: 'APPLIED' },
      });
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('96500.00');
      expect((await feeds()).connection?.lastEventAt).not.toBeNull();
    });

    it('sin regla entra sin categoría y queda para categorizar', async () => {
      await arrive([payment({ description: 'Juan Pérez' })]);
      const dashboard = (await api().get('/api/v1/dashboard').expect(200)).body;
      expect(dashboard.uncategorizedCount).toBe(1);
      const list = await movements(ana, '?uncategorized=true');
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ category: null, description: 'Juan Pérez' });

      const otros = await category(ctx.app, ana, 'Otros gastos');
      await api()
        .patch(`/api/v1/transactions/${list[0].id}`)
        .send({ categoryId: otros.id })
        .expect(200);
      expect((await api().get('/api/v1/dashboard').expect(200)).body.uncategorizedCount).toBe(0);
      expect(await movements(ana, '?uncategorized=true')).toHaveLength(0);
    });

    it('un cobro es un ingreso y un rendimiento va a Rendimientos', async () => {
      await arrive([payment({ kind: 'INCOME', amount: '20000.00', description: 'Ventas web' })]);
      await arrive([payment({ kind: 'YIELD', amount: '12.34', description: 'Rendimientos' })]);
      const [yieldRow, income] = await movements();
      expect(income).toMatchObject({ type: 'INCOME', amount: '20000.00' });
      expect(yieldRow).toMatchObject({ type: 'INCOME', category: { name: 'Rendimientos' } });
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('120012.34');
    });

    it('una devolución de un pago ya traído crea el ingreso contrario', async () => {
      const original = payment();
      await arrive([original]);
      await arrive([
        payment({
          kind: 'REFUND',
          direction: 'IN',
          refundOf: original.externalId,
          description: 'x',
        }),
      ]);
      const [refund] = await movements();
      expect(refund).toMatchObject({ type: 'INCOME', description: 'Devolución: Café Martínez' });
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('100000.00');
    });

    it('la compra de dólares es una transferencia entre los dos saldos', async () => {
      const dollars = await addPocket(ctx.app, ana, wallet.id, {
        name: 'Dólares',
        kind: 'AVAILABLE',
        currency: 'USD',
      });
      await arrive([
        payment({
          kind: 'FX',
          amount: '15000.00',
          amountIn: '10.00',
          currencyIn: 'USD',
          description: 'Compra de dólares',
        }),
      ]);
      const [fx] = await movements();
      expect(fx).toMatchObject({
        kind: 'TRANSFER',
        amountOut: '15000.00',
        amountIn: '10.00',
        currencyIn: 'USD',
        external: { status: 'APPLIED' },
      });
      expect(await balanceOf(ctx.app, ana, dollars.id)).toBe('10.00');
    });

    it('una firma inválida da 401 y no crea nada', async () => {
      mp.resources.set('r1', [payment()]);
      const res = await notify(ANA_MP, 'r1', { signature: 'forged' }).expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
      await notify(ANA_MP, 'r1', { signature: '' }).expect(401);
      expect(await movements()).toHaveLength(0);
    });

    it('un aviso repetido no crea nada, ni con el mismo id de aviso ni con otro', async () => {
      mp.resources.set('r1', [payment()]);
      await notify(ANA_MP, 'r1', { requestId: 'same' }).expect(200);
      await notify(ANA_MP, 'r1', { requestId: 'same' }).expect(200);
      await notify(ANA_MP, 'r1', { requestId: 'another' }).expect(200);
      expect(await movements()).toHaveLength(1);
    });

    it('webhook y sincronización del mismo movimiento no lo duplican', async () => {
      const coffee = payment();
      await arrive([coffee]);
      mp.history = [coffee];
      await api().post('/api/v1/sync').expect(200);
      expect(await movements()).toHaveLength(1);
    });

    it('con Render dormido no se pierde: lo trae POST /sync', async () => {
      mp.history = [payment({ description: 'Kiosco' })];
      await api().post('/api/v1/sync').expect(200);
      expect((await movements())[0]).toMatchObject({
        description: 'Kiosco',
        channel: 'MERCADO_PAGO',
      });
    });

    it('si Mercado Pago no responde, el aviso da 500 (para que reintente) y la sync no falla', async () => {
      mp.down = true;
      mp.resources.set('r1', [payment()]);
      await notify(ANA_MP, 'r1', { requestId: 'retry-me' }).expect(500);
      await api().post('/api/v1/sync').expect(200);
      mp.down = false;
      await notify(ANA_MP, 'r1', { requestId: 'retry-me' }).expect(200);
      expect(await movements()).toHaveLength(1);
    });

    it('un pago pendiente o rechazado (sin movimientos) no crea nada', async () => {
      await arrive([]);
      expect(await movements()).toHaveLength(0);
    });

    it('un aviso de un usuario de Mercado Pago no conectado se acepta sin hacer nada', async () => {
      mp.resources.set('r1', [payment()]);
      await notify('9999', 'r1').expect(200);
      expect(await ctx.prisma.externalMovement.count()).toBe(0);
    });
  });

  describe('ya lo cargaste (MPG-06)', () => {
    beforeEach(async () => {
      wallet = await setup(ana, ANA_MP);
    });

    it('lo cargado por Telegram no se duplica; "No es el mismo" lo crea aparte', async () => {
      const salidas = await category(ctx.app, ana, 'Salidas');
      const manual = await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: wallet.pockets[0].id,
          categoryId: salidas.id,
          amount: '3500',
          date: YESTERDAY,
          description: 'café',
        })
        .expect(201);
      const coffee = payment({ date: TODAY as LocalDate });
      await arrive([coffee]);

      let list = await movements();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: manual.body.id,
        description: 'café',
        external: { status: 'LINKED' },
      });
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('96500.00');

      const linked = await externalOf(coffee.externalId);
      const unlinked = await api()
        .post(`/api/v1/external-movements/${linked?.id}/unlink`)
        .expect(200);
      expect(unlinked.body.transactionId).not.toBeNull();
      list = await movements();
      expect(list).toHaveLength(2);
      expect(list.find((m) => m.id === manual.body.id)).toMatchObject({ external: null });
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('93000.00');
      // Unlinking twice is not possible.
      await api().post(`/api/v1/external-movements/${linked?.id}/unlink`).expect(422);
    });

    it('un monto distinto ($ 3.600) se crea aparte', async () => {
      const salidas = await category(ctx.app, ana, 'Salidas');
      await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: wallet.pockets[0].id,
          categoryId: salidas.id,
          amount: '3500',
          date: YESTERDAY,
        })
        .expect(201);
      await arrive([payment({ amount: '3600.00' })]);
      expect(await movements()).toHaveLength(2);
    });

    it('el pago de la Visa cargado en platin se vincula y no cuenta como gasto', async () => {
      const otros = await category(ctx.app, ana, 'Otros gastos');
      const visa = (
        await api()
          .post('/api/v1/cards')
          .send({ name: 'Visa', closingDay: 30, dueDay: 5 })
          .expect(201)
      ).body;
      await api()
        .post(`/api/v1/cards/${visa.id}/charges`)
        .send({
          categoryId: otros.id,
          currency: 'ARS',
          description: 'Compra',
          date: '2026-11-10',
          totalAmount: '80000',
          installmentsCount: 1,
        })
        .expect(201);
      const [statement] = (
        await api().get(`/api/v1/cards/${visa.id}/statements?from=2026-11&to=2026-11`).expect(200)
      ).body as StatementSummary[];
      await api().post(`/api/v1/statements/${statement.id}/close`).send({}).expect(200);
      await api()
        .post(`/api/v1/statements/${statement.id}/payments`)
        .send({ pocketId: wallet.pockets[0].id, currency: 'ARS', amount: '80000', date: YESTERDAY })
        .expect(201);

      await arrive([payment({ amount: '80000.00', description: 'Pago Visa' })]);
      const expenses = (await movements(ana, '?type=EXPENSE')).filter(
        (m) => m.kind === 'TRANSACTION',
      );
      expect(expenses).toHaveLength(0);
      const [transfer] = await movements(ana, '?type=TRANSFER');
      expect(transfer).toMatchObject({
        statement: { cardName: 'Visa' },
        external: { status: 'LINKED' },
      });
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('20000.00');
    });
  });

  describe('reservas y "Para revisar" (MPG-05, 09)', () => {
    beforeEach(async () => {
      wallet = await setup(ana, ANA_MP);
    });

    it('mover a una reserva sin asignar queda en Para revisar hasta asignarla', async () => {
      await arrive([
        payment({
          kind: 'RESERVE_IN',
          amount: '50000.00',
          externalReserveId: 'res-vac',
          reserveName: 'Vacaciones',
          description: 'Vacaciones',
        }),
      ]);
      expect(await movements()).toHaveLength(0);
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('100000.00');
      const held = (await api().get(`${BASE}/held`).expect(200)).body;
      expect(held).toEqual([
        expect.objectContaining({
          kind: 'RESERVE_IN',
          holdReason: 'RESERVE_NOT_MAPPED',
          amount: '50000.00',
          reserve: expect.objectContaining({ name: 'Vacaciones' }),
        }),
      ]);
      expect((await feeds()).connection).toMatchObject({ heldCount: 1, unmappedReserves: 1 });

      const [reserve] = (await api().get(`${BASE}/reserves`).expect(200)).body;
      expect(reserve).toMatchObject({
        name: 'Vacaciones',
        currency: 'ARS',
        pocket: null,
        heldCount: 1,
      });
      // Not the balance itself, nor a reserve of another account.
      await api()
        .put(`${BASE}/reserves/${reserve.id}`)
        .send({ pocketId: wallet.pockets[0].id })
        .expect(422);
      const other = await createAccount(ctx.app, ana, { name: 'Brubank' });
      const foreign = await addPocket(ctx.app, ana, other.id, { name: 'Viaje' });
      await api().put(`${BASE}/reserves/${reserve.id}`).send({ pocketId: foreign.id }).expect(422);

      const vacaciones = await addPocket(ctx.app, ana, wallet.id, { name: 'Vacaciones' });
      await api()
        .put(`${BASE}/reserves/${reserve.id}`)
        .send({ pocketId: vacaciones.id })
        .expect(204);
      expect(await balanceOf(ctx.app, ana, vacaciones.id)).toBe('50000.00');
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('50000.00');
      expect((await api().get(`${BASE}/held`).expect(200)).body).toHaveLength(0);

      // Taking money out of it now goes straight through.
      await arrive([
        payment({ kind: 'RESERVE_OUT', amount: '20000.00', externalReserveId: 'res-vac' }),
      ]);
      expect(await balanceOf(ctx.app, ana, vacaciones.id)).toBe('30000.00');
    });

    it('una moneda no activada espera hasta activarla y agregarla a la cuenta', async () => {
      await arrive([payment({ currency: 'BRL', amount: '50.00', date: TODAY as LocalDate })]);
      expect((await api().get(`${BASE}/held`).expect(200)).body[0]).toMatchObject({
        holdReason: 'CURRENCY_NOT_ENABLED',
      });

      await api()
        .patch('/api/v1/users/me')
        .send({ currencies: ['ARS', 'USD', 'BRL'] })
        .expect(200);
      const retry = await api().post(`${BASE}/held/retry`).expect(200);
      expect(retry.body).toEqual({ applied: 0, held: 1 });
      expect((await api().get(`${BASE}/held`).expect(200)).body[0]).toMatchObject({
        holdReason: 'NO_BALANCE_IN_CURRENCY',
      });

      await addPocket(ctx.app, ana, wallet.id, {
        name: 'Reales',
        kind: 'AVAILABLE',
        currency: 'BRL',
      });
      // The sync loads today's rates and retries what waits.
      await api().post('/api/v1/sync').expect(200);
      expect((await api().get(`${BASE}/held`).expect(200)).body).toHaveLength(0);
      const [reales] = await movements();
      expect(reales).toMatchObject({ currency: 'BRL', amount: '50.00', channel: 'MERCADO_PAGO' });
    });

    it('lo que no se quiere resolver se descarta y no vuelve', async () => {
      const brl = payment({ currency: 'BRL', amount: '50.00' });
      await arrive([brl]);
      const [held] = (await api().get(`${BASE}/held`).expect(200)).body;
      await api().delete(`${BASE}/held/${held.id}`).expect(204);
      mp.history = [brl];
      await api().post('/api/v1/sync').expect(200);
      expect((await api().get(`${BASE}/held`).expect(200)).body).toHaveLength(0);
    });
  });

  describe('corregir (MPG-08)', () => {
    beforeEach(async () => {
      wallet = await setup(ana, ANA_MP);
    });

    it('borrado no vuelve a entrar, ni por aviso ni por sync', async () => {
      const coffee = payment();
      const resource = await arrive([coffee]);
      const [row] = await movements();
      await api().delete(`/api/v1/transactions/${row.id}`).expect(204);
      expect(await externalOf(coffee.externalId)).toMatchObject({
        status: 'DISMISSED',
        transactionId: null,
      });
      await notify(ANA_MP, resource).expect(200);
      mp.history = [coffee];
      await api().post('/api/v1/sync').expect(200);
      expect(await movements()).toHaveLength(0);
    });

    it('una transferencia a Santander pasa a ser "una transferencia mía"', async () => {
      const santander = await createAccount(ctx.app, ana, { name: 'Santander', kind: 'BANK' });
      const sent = payment({ amount: '30000.00', description: 'Juan Guidi' });
      await arrive([sent]);
      const [row] = await movements();
      const res = await api()
        .post(`/api/v1/transactions/${row.id}/convert`)
        .send({ to: 'TRANSFER', toAccountId: santander.id })
        .expect(200);
      await api().get(`/api/v1/transactions/${row.id}`).expect(404);
      const [transfer] = await movements();
      expect(transfer).toMatchObject({
        kind: 'TRANSFER',
        id: res.body.transferId,
        amountOut: '30000.00',
        external: { status: 'APPLIED' },
      });
      expect(await balanceOf(ctx.app, ana, santander.pockets[0].id)).toBe('30000.00');
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('70000.00');
      // The link moved: the notice again creates nothing.
      expect(await externalOf(sent.externalId)).toMatchObject({
        transferId: res.body.transferId,
        transactionId: null,
      });
    });

    it('un cobro desde otra cuenta mía se convierte en transferencia que entra', async () => {
      const santander = await createAccount(ctx.app, ana, {
        name: 'Santander',
        kind: 'BANK',
        initialBalance: '50000',
      });
      await arrive([payment({ kind: 'INCOME', amount: '10000.00', description: 'Yo' })]);
      const [row] = await movements();
      await api()
        .post(`/api/v1/transactions/${row.id}/convert`)
        .send({ to: 'TRANSFER', toAccountId: santander.id })
        .expect(200);
      expect(await balanceOf(ctx.app, ana, santander.pockets[0].id)).toBe('40000.00');
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('110000.00');
    });

    it('el pago de la Visa pasa a ser "el pago de una tarjeta" y el resumen cierra', async () => {
      const otros = await category(ctx.app, ana, 'Otros gastos');
      const visa = (
        await api()
          .post('/api/v1/cards')
          .send({ name: 'Visa', closingDay: 30, dueDay: 5 })
          .expect(201)
      ).body;
      await api()
        .post(`/api/v1/cards/${visa.id}/charges`)
        .send({
          categoryId: otros.id,
          currency: 'ARS',
          description: 'Compra',
          date: '2026-11-10',
          totalAmount: '45000',
          installmentsCount: 1,
        })
        .expect(201);
      const [statement] = (
        await api().get(`/api/v1/cards/${visa.id}/statements?from=2026-11&to=2026-11`).expect(200)
      ).body as StatementSummary[];
      await api().post(`/api/v1/statements/${statement.id}/close`).send({}).expect(200);

      await arrive([payment({ amount: '45000.00', description: 'Visa' })]);
      const [row] = await movements(ana, '?type=EXPENSE');
      await api()
        .post(`/api/v1/transactions/${row.id}/convert`)
        .send({ to: 'CARD_PAYMENT', statementId: statement.id })
        .expect(200);
      const after = (await api().get(`/api/v1/statements/${statement.id}`).expect(200)).body;
      expect(after).toMatchObject({ status: 'PAID' });
      expect(
        (await movements(ana, '?type=EXPENSE')).filter((m) => m.kind === 'TRANSACTION'),
      ).toHaveLength(0);
      expect(await balanceOf(ctx.app, ana, wallet.pockets[0].id)).toBe('55000.00');
    });

    it('lo cargado a mano no se convierte (NOT_CONVERTIBLE)', async () => {
      const otros = await category(ctx.app, ana, 'Otros gastos');
      const santander = await createAccount(ctx.app, ana, { name: 'Santander' });
      const manual = await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: wallet.pockets[0].id,
          categoryId: otros.id,
          amount: '100',
          date: TODAY,
        })
        .expect(201);
      const res = await api()
        .post(`/api/v1/transactions/${manual.body.id}/convert`)
        .send({ to: 'TRANSFER', toAccountId: santander.id })
        .expect(422);
      expect(res.body.code).toBe('NOT_CONVERTIBLE');
      await arrive([payment({ kind: 'INCOME', amount: '100.00' })]);
      const [income] = await movements(ana, '?type=INCOME');
      const card = await api()
        .post(`/api/v1/transactions/${income.id}/convert`)
        .send({ to: 'CARD_PAYMENT', statementId: manual.body.id })
        .expect(422);
      expect(card.body.code).toBe('NOT_CONVERTIBLE');
    });
  });

  describe('límite del plan Gratis (MPG-07)', () => {
    beforeEach(async () => {
      wallet = await setup(ana, ANA_MP);
    });

    it('con el Gratis, el segundo del día no se crea y el perfil lo cuenta una vez', async () => {
      await setFreeLimit(1);
      await arrive([payment({ date: TODAY as LocalDate })]);
      const second = payment({ kind: 'INCOME', amount: '20000.00', date: TODAY as LocalDate });
      const resource = await arrive([second]);
      // Repeated by the webhook and by the sync: still one left out.
      await notify(ANA_MP, resource).expect(200);
      mp.history = [second];
      await api().post('/api/v1/sync').expect(200);

      expect(await movements()).toHaveLength(1);
      expect(await externalOf(second.externalId)).toBeNull();
      expect((await api().get(`${BASE}/usage`).expect(200)).body).toMatchObject({
        day: TODAY,
        created: 1,
        overLimit: 1,
        limit: 1,
        planName: 'Gratis',
      });
    });

    it('cuenta por el día del movimiento, y lo vinculado no cuenta', async () => {
      await setFreeLimit(1);
      const otros = await category(ctx.app, ana, 'Otros gastos');
      await api()
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          pocketId: wallet.pockets[0].id,
          categoryId: otros.id,
          amount: '1200',
          date: TODAY,
        })
        .expect(201);
      await arrive([payment({ date: YESTERDAY as LocalDate })]);
      await arrive([payment({ date: TODAY as LocalDate })]);
      await arrive([payment({ amount: '1200.00', date: TODAY as LocalDate })]);
      expect(await movements()).toHaveLength(3);
      expect((await api().get(`${BASE}/usage`).expect(200)).body).toMatchObject({
        created: 1,
        overLimit: 0,
      });
    });

    it('con Pro entran todos', async () => {
      await setFreeLimit(1);
      const pro = await ctx.prisma.plan.findUniqueOrThrow({ where: { key: 'pro' } });
      await ctx.prisma.userPlan.create({
        data: { userId: ana.id, planId: pro.id, source: 'ADMIN' },
      });
      await arrive([payment()]);
      await arrive([payment({ amount: '10.00' })]);
      expect(await movements()).toHaveLength(2);
      expect((await api().get(`${BASE}/usage`).expect(200)).body.limit).toBeNull();
    });
  });

  describe('conexión: suspensión, desconexión y revocación (MPG-10)', () => {
    beforeEach(async () => {
      wallet = await setup(ana, ANA_MP);
    });

    it('un usuario suspendido no recibe nada, tampoco después', async () => {
      await ctx.prisma.user.update({ where: { id: ana.id }, data: { status: 'SUSPENDED' } });
      const coffee = payment();
      await arrive([coffee]);
      await ctx.prisma.user.update({ where: { id: ana.id }, data: { status: 'ACTIVE' } });
      mp.history = [coffee];
      await api().post('/api/v1/sync').expect(200);
      expect(await movements()).toHaveLength(0);
    });

    it('desconecto y dejan de entrar; lo que ya entró se conserva', async () => {
      await arrive([payment()]);
      await api().delete(BASE).expect(204);
      await arrive([payment({ amount: '1.00' })]);
      expect(await movements()).toHaveLength(1);
      expect((await feeds()).connection).toBeNull();
    });

    it('quitar el permiso desde Mercado Pago deja "Volvé a conectar"', async () => {
      await http()
        .post(`${BASE}/webhook`)
        .set('x-signature', FAKE_SIGNATURE)
        .set('x-request-id', 'deauth-1')
        .send({ type: 'mp-connect', action: 'application.deauthorized', user_id: ANA_MP })
        .expect(200);
      expect((await feeds()).connection).toMatchObject({ status: 'NEEDS_RECONNECT' });
      const row = await ctx.prisma.feedConnection.findFirstOrThrow({ where: { userId: ana.id } });
      expect(row.accessTokenEnc).toBeNull();
      expect((await api().get('/api/v1/dashboard').expect(200)).body.feedsToReconnect).toEqual([
        'MERCADO_PAGO',
      ]);
      await arrive([payment()]);
      expect(await movements()).toHaveLength(0);

      // Connecting again picks up where it was, with the same account.
      await connect(ana, ANA_MP);
      expect((await feeds()).connection).toMatchObject({
        status: 'ACTIVE',
        account: { id: wallet.id },
      });
    });

    it('un token rechazado al leer un aviso también pide volver a conectar', async () => {
      mp.revoked.add(mp.lastAccessToken);
      await arrive([payment()]);
      expect((await feeds()).connection?.status).toBe('NEEDS_RECONNECT');
    });

    it('la sync renueva el token cuando vence en menos de 30 días; si falla, pide reconectar', async () => {
      await ctx.prisma.feedConnection.updateMany({
        where: { userId: ana.id },
        data: { tokenExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
      });
      await api().post('/api/v1/sync').expect(200);
      expect(mp.refreshed).toBe(1);
      const renewed = await ctx.prisma.feedConnection.findFirstOrThrow({
        where: { userId: ana.id },
      });
      expect(renewed.tokenExpiresAt?.getTime()).toBeGreaterThan(
        Date.now() + 100 * 24 * 60 * 60 * 1000,
      );

      await ctx.prisma.feedConnection.updateMany({
        where: { userId: ana.id },
        data: { tokenExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
      });
      mp.refreshFails = true;
      await api().post('/api/v1/sync').expect(200);
      expect((await feeds()).connection?.status).toBe('NEEDS_RECONNECT');
    });

    it('"Empezar de cero" borra la conexión', async () => {
      await arrive([payment()]);
      await api()
        .post('/api/v1/users/me/reset')
        .send({ confirmEmail: ana.email, password: 'una-clave-segura', keepCategories: true })
        .expect(200);
      expect(await ctx.prisma.feedConnection.count({ where: { userId: ana.id } })).toBe(0);
      expect(await ctx.prisma.externalMovement.count({ where: { userId: ana.id } })).toBe(0);
      expect(await ctx.prisma.feedDailyUsage.count({ where: { userId: ana.id } })).toBe(0);
    });
  });

  describe('aislamiento entre usuarios', () => {
    it('nadie ve ni toca la conexión, las reservas ni los movimientos de otro', async () => {
      wallet = await setup(ana, ANA_MP);
      await arrive([payment({ kind: 'RESERVE_IN', externalReserveId: 'r', reserveName: 'Auto' })]);
      await arrive([payment()]);
      const beto = await registerUser(ctx.app);
      const theirs = api(beto);

      expect((await feeds(beto)).connection).toBeNull();
      await theirs.get(`${BASE}/held`).expect(404);
      await theirs.get(`${BASE}/reserves`).expect(404);
      const [reserve] = (await api().get(`${BASE}/reserves`).expect(200)).body;
      await theirs
        .put(`${BASE}/reserves/${reserve.id}`)
        .send({ pocketId: wallet.pockets[0].id })
        .expect(404);
      await theirs.patch(BASE).send({ accountId: wallet.id }).expect(404);

      // Beto with his own connection still cannot reach Ana's rows.
      await setup(beto, BETO_MP);
      const [anaHeld] = (await api().get(`${BASE}/held`).expect(200)).body;
      await theirs.delete(`${BASE}/held/${anaHeld.id}`).expect(404);
      await theirs
        .put(`${BASE}/reserves/${reserve.id}`)
        .send({ pocketId: wallet.pockets[0].id })
        .expect(404);
      const [anaMovement] = await movements();
      await theirs
        .post(`/api/v1/transactions/${anaMovement.id}/convert`)
        .send({ to: 'TRANSFER', toAccountId: wallet.id })
        .expect(404);
      const external = await ctx.prisma.externalMovement.findFirstOrThrow({
        where: { userId: ana.id, status: 'APPLIED' },
      });
      await theirs.post(`/api/v1/external-movements/${external.id}/unlink`).expect(404);
      // Choosing Ana's account as his own wallet is refused too.
      await theirs.patch(BASE).send({ accountId: wallet.id }).expect(404);
      expect(await movements(beto)).toHaveLength(0);
    });
  });
});
