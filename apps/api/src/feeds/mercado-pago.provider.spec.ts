import { createHmac } from 'node:crypto';
import { FeedAuthError } from './account-feed-provider';
import { FeedTokenCipher } from './feed-token-cipher';
import {
  MercadoPagoProvider,
  type MpPayment,
  normalizePayment,
  verifyMercadoPagoSignature,
} from './mercado-pago.provider';
import type { AppConfig } from '../config/app-config';

const SECRET = 'webhook-secret';
const ME = '1001';
const NOW = new Date('2026-11-24T15:00:00.000Z');

function sign(dataId: string, requestId: string, ts = String(NOW.getTime())): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', SECRET).update(manifest).digest('hex')}`;
}

function paid(overrides: Partial<MpPayment> = {}): MpPayment {
  return {
    id: 123,
    status: 'approved',
    currency_id: 'ARS',
    transaction_amount: 3500,
    // 23:30 in Buenos Aires is already the 24th in UTC: the date is Argentina's.
    date_approved: '2026-11-23T23:30:00.000-03:00',
    description: 'Café Martínez',
    collector_id: 999,
    payer: { id: ME },
    transaction_details: { total_paid_amount: 3500, net_received_amount: 3325 },
    ...overrides,
  };
}

describe('x-signature (ADR 0037)', () => {
  it('acepta la firma correcta y rechaza otra, vieja o sin partes', () => {
    expect(verifyMercadoPagoSignature(SECRET, sign('123', 'req'), 'req', '123', NOW)).toBe(true);
    expect(verifyMercadoPagoSignature('otro', sign('123', 'req'), 'req', '123', NOW)).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, sign('124', 'req'), 'req', '123', NOW)).toBe(false);
    const old = String(NOW.getTime() - 6 * 60_000);
    expect(verifyMercadoPagoSignature(SECRET, sign('123', 'req', old), 'req', '123', NOW)).toBe(
      false,
    );
    expect(verifyMercadoPagoSignature(SECRET, 'v1=abc', 'req', '123', NOW)).toBe(false);
    expect(verifyMercadoPagoSignature(SECRET, 'ts=abc,v1=abc', 'req', '123', NOW)).toBe(false);
  });

  it('un data.id alfanumérico se firma en minúsculas', () => {
    expect(verifyMercadoPagoSignature(SECRET, sign('abc1', 'r'), 'r', 'ABC1', NOW)).toBe(true);
  });

  it('el proveedor arma el aviso con el user_id y lee el id de la query', () => {
    const provider = new MercadoPagoProvider('id', 'secret', SECRET);
    const notice = provider.verifyWebhook({
      headers: { 'x-signature': sign('123', 'req-1'), 'x-request-id': 'req-1' },
      query: { 'data.id': '123', type: 'payment' },
      body: { type: 'payment', action: 'payment.created', user_id: 1001, data: { id: '123' } },
      now: NOW,
    });
    expect(notice).toEqual({
      kind: 'MOVEMENT',
      requestId: 'req-1',
      externalUserId: ME,
      resourceId: '123',
    });

    const deauthorized = provider.verifyWebhook({
      headers: { 'x-signature': sign('9', 'req-2'), 'x-request-id': 'req-2' },
      query: { 'data.id': '9' },
      body: { type: 'mp-connect', action: 'application.deauthorized', user_id: 1001 },
      now: NOW,
    });
    expect(deauthorized).toEqual({ kind: 'DEAUTHORIZED', requestId: 'req-2', externalUserId: ME });

    const unsigned = provider.verifyWebhook({ headers: {}, query: {}, body: {}, now: NOW });
    expect(unsigned).toBeNull();
  });
});

describe('normalizePayment (regla "Mercado Pago")', () => {
  it('lo que pagué es un gasto por lo que pagué, en la fecha de Argentina', () => {
    expect(normalizePayment(paid(), ME)).toEqual([
      {
        externalId: '123',
        kind: 'EXPENSE',
        amount: '3500.00',
        currency: 'ARS',
        date: '2026-11-23',
        occurredAt: '2026-11-24T02:30:00.000Z',
        description: 'Café Martínez',
      },
    ]);
  });

  it('lo que cobré es un ingreso por el neto, con el nombre de quien pagó', () => {
    const [income] = normalizePayment(
      paid({ collector_id: ME, payer: { id: 55, first_name: 'Ana', last_name: 'Gómez' } }),
      ME,
    );
    expect(income).toMatchObject({ kind: 'INCOME', amount: '3325.00', description: 'Ana Gómez' });
  });

  it('pendiente, rechazado o en otra moneda no crea nada', () => {
    expect(normalizePayment(paid({ status: 'pending', date_approved: null }), ME)).toEqual([]);
    expect(normalizePayment(paid({ status: 'rejected' }), ME)).toEqual([]);
    expect(normalizePayment(paid({ currency_id: 'MXN' }), ME)).toEqual([]);
    expect(normalizePayment(paid({ payer: { id: 7 } }), ME)).toEqual([]);
  });

  it('cada devolución es su propio movimiento, al revés del pago', () => {
    const movements = normalizePayment(
      paid({
        status: 'refunded',
        refunds: [{ id: 9, amount: 3500, date_created: '2026-11-24T10:00:00.000-03:00' }],
      }),
      ME,
    );
    expect(movements[1]).toMatchObject({
      externalId: '123:refund:9',
      kind: 'REFUND',
      direction: 'IN',
      refundOf: '123',
      amount: '3500.00',
      date: '2026-11-24',
    });
  });
});

describe('MercadoPagoProvider por HTTP', () => {
  function provider(responses: { status: number; body?: unknown }[]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
    }) as unknown as typeof fetch;
    return { mp: new MercadoPagoProvider('client', 'secret', SECRET, fetcher), calls };
  }

  it('la URL de autorización lleva PKCE S256, state y la vuelta', () => {
    const { mp } = provider([]);
    const url = new URL(
      mp.buildAuthorizationUrl({ state: 's', codeChallenge: 'c', redirectUri: 'http://app/cb' }),
    );
    expect(url.origin).toBe('https://auth.mercadopago.com');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client',
      response_type: 'code',
      state: 's',
      code_challenge: 'c',
      code_challenge_method: 'S256',
      redirect_uri: 'http://app/cb',
    });
  });

  it('canjea el código con el verificador y devuelve el user_id', async () => {
    const { mp, calls } = provider([
      {
        status: 200,
        body: { access_token: 'APP_USR-x', refresh_token: 'TG-y', expires_in: 100, user_id: 1001 },
      },
    ]);
    const tokens = await mp.exchangeCode({ code: 'TG-code', codeVerifier: 'v', redirectUri: 'r' });
    expect(tokens).toMatchObject({
      accessToken: 'APP_USR-x',
      refreshToken: 'TG-y',
      externalUserId: ME,
    });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      grant_type: 'authorization_code',
      code_verifier: 'v',
      client_secret: 'secret',
    });
  });

  it('un token rechazado es FeedAuthError; un 500 es otro error (reintento)', async () => {
    await expect(provider([{ status: 401 }]).mp.getMovement('t', '1', ME)).rejects.toBeInstanceOf(
      FeedAuthError,
    );
    await expect(
      provider([{ status: 500 }]).mp.getMovement('t', '1', ME),
    ).rejects.not.toBeInstanceOf(FeedAuthError);
    await expect(provider([{ status: 400 }]).mp.refresh('r')).rejects.toBeInstanceOf(FeedAuthError);
  });

  it('un id que no es un número no se consulta', async () => {
    const { mp, calls } = provider([]);
    expect(await mp.getMovement('t', '../users/me', ME)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('listSince busca como cobrador y como pagador desde el cursor y avanza', async () => {
    const { mp, calls } = provider([
      {
        status: 200,
        body: {
          results: [
            paid({
              collector_id: ME,
              payer: { id: 5 },
              date_last_updated: '2026-11-24T12:00:00.000Z',
            }),
          ],
        },
      },
      {
        status: 200,
        body: { results: [paid({ id: 124, date_last_updated: '2026-11-24T13:00:00.000Z' })] },
      },
    ]);
    const result = await mp.listSince(
      't',
      '2026-11-24T00:00:00.000Z',
      new Date('2026-11-17T00:00:00.000Z'),
      ME,
    );
    expect(result.movements.map((m) => m.kind)).toEqual(['INCOME', 'EXPENSE']);
    expect(result.cursor).toBe('2026-11-24T13:00:00.000Z');
    expect(calls[0].url).toContain('collector.id=1001');
    expect(calls[1].url).toContain('payer.id=1001');
    expect(decodeURIComponent(calls[0].url)).toContain('begin_date=2026-11-24T00:00:00.000Z');
  });
});

describe('FeedTokenCipher', () => {
  const cipher = new FeedTokenCipher({
    env: { FEED_TOKEN_KEY: Buffer.alloc(32, 1).toString('base64') },
  } as unknown as AppConfig);

  it('cifra y descifra; cada vez con otro iv; alterado no descifra', () => {
    const a = cipher.encrypt('APP_USR-secret');
    const b = cipher.encrypt('APP_USR-secret');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(Buffer.from(a).toString('utf8')).not.toContain('APP_USR');
    expect(cipher.decrypt(a)).toBe('APP_USR-secret');
    const tampered = Buffer.from(a);
    tampered[tampered.length - 1] ^= 1;
    expect(() => cipher.decrypt(tampered)).toThrow();
  });
});
