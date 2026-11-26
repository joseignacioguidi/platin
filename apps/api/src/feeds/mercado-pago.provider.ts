import {
  CURRENCIES,
  type Currency,
  type ExternalMovementInput,
  FeedProvider,
  localDateAt,
  Money,
} from '@platin/domain';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type AccountFeedProvider,
  FeedAuthError,
  type FeedNotice,
  type FeedTokens,
  type WebhookRequest,
} from './account-feed-provider';

const API = 'https://api.mercadopago.com';
const AUTHORIZATION = 'https://auth.mercadopago.com/authorization';
/** A signed notice older than this is rejected (replays). */
const SIGNATURE_MAX_AGE_MS = 5 * 60_000;
const PAGE = 100;
/** The backup sync reads at most this many pages per side and call. */
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 10_000;

/** The parts of a payment platin reads (GET /v1/payments/:id and the search). */
export interface MpPayment {
  id: number | string;
  status: string;
  currency_id: string;
  transaction_amount: number;
  date_approved?: string | null;
  date_created?: string | null;
  date_last_updated?: string | null;
  description?: string | null;
  statement_descriptor?: string | null;
  collector_id?: number | string | null;
  payer?: {
    id?: number | string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  transaction_details?: {
    net_received_amount?: number | null;
    total_paid_amount?: number | null;
  } | null;
  refunds?: { id: number | string; amount: number; date_created: string; status?: string | null }[];
}

/** Statuses of a payment whose money moved (refunds come as their own movements). */
const SETTLED = new Set([
  'approved',
  'refunded',
  'partially_refunded',
  'charged_back',
  'in_mediation',
]);

function amountOf(value: number | null | undefined, currency: Currency): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  return Money.of(value.toFixed(2), currency).toString();
}

function currencyOf(code: string): Currency | null {
  return (CURRENCIES as readonly string[]).includes(code) ? (code as Currency) : null;
}

function personName(payer: MpPayment['payer']): string | null {
  const name = [payer?.first_name, payer?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

/**
 * A payment as platin movements (the "Mercado Pago" rule): when the person is the collector it
 * is money in (net of fees); when they are the payer, money out (what they paid). Each refund
 * is a movement of its own, the other way. Reserves, currency changes and yields are not in
 * the payments API: phase 40 has to confirm where they come from (ADR 0037).
 */
export function normalizePayment(
  payment: MpPayment,
  externalUserId: string,
): ExternalMovementInput[] {
  const currency = currencyOf(payment.currency_id);
  const approvedAt = payment.date_approved ?? null;
  if (!currency || !approvedAt || !SETTLED.has(payment.status)) return [];
  const isCollector = String(payment.collector_id ?? '') === externalUserId;
  const isPayer = String(payment.payer?.id ?? '') === externalUserId;
  if (!isCollector && !isPayer) return [];
  const id = String(payment.id);
  const reason = payment.description?.trim() || payment.statement_descriptor?.trim() || null;
  const movements: ExternalMovementInput[] = [];
  const amount = isCollector
    ? amountOf(
        payment.transaction_details?.net_received_amount ?? payment.transaction_amount,
        currency,
      )
    : amountOf(
        payment.transaction_details?.total_paid_amount ?? payment.transaction_amount,
        currency,
      );
  if (amount) {
    movements.push({
      externalId: id,
      kind: isCollector ? 'INCOME' : 'EXPENSE',
      amount,
      currency,
      date: localDateAt(new Date(approvedAt)),
      occurredAt: new Date(approvedAt).toISOString(),
      description: (isCollector ? (personName(payment.payer) ?? reason) : reason) ?? 'Mercado Pago',
    });
  }
  for (const refund of payment.refunds ?? []) {
    const refunded = amountOf(refund.amount, currency);
    if (!refunded || (refund.status && refund.status !== 'approved')) continue;
    movements.push({
      externalId: `${id}:refund:${refund.id}`,
      kind: 'REFUND',
      direction: isCollector ? 'OUT' : 'IN',
      refundOf: id,
      amount: refunded,
      currency,
      date: localDateAt(new Date(refund.date_created)),
      occurredAt: new Date(refund.date_created).toISOString(),
      description: reason ?? 'Mercado Pago',
    });
  }
  return movements;
}

/** x-signature: HMAC-SHA256 of "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". */
export function verifyMercadoPagoSignature(
  secret: string,
  signature: string,
  requestId: string,
  dataId: string | undefined,
  now: Date,
): boolean {
  const parts = new Map(
    signature.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key, rest.join('=')] as const;
    }),
  );
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;
  // Mercado Pago sends milliseconds; accept seconds too.
  const sentAt = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(now.getTime() - sentAt) > SIGNATURE_MAX_AGE_MS) return false;
  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `${id ? `id:${id};` : ''}request-id:${requestId};ts:${ts};`;
  const expected = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'));
  const received = Buffer.from(v1);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function header(headers: WebhookRequest['headers'], name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Mercado Pago through its HTTP API, with fetch (no SDK, ADR 0037). Built from the public
 * documentation; what a personal account really reports is checked in phase 40.
 */
export class MercadoPagoProvider implements AccountFeedProvider {
  readonly provider = FeedProvider.MERCADO_PAGO;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly webhookSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  buildAuthorizationUrl(request: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL(AUTHORIZATION);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('platform_id', 'mp');
    url.searchParams.set('state', request.state);
    url.searchParams.set('redirect_uri', request.redirectUri);
    url.searchParams.set('code_challenge', request.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  exchangeCode(request: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<FeedTokens> {
    return this.token({
      grant_type: 'authorization_code',
      code: request.code,
      redirect_uri: request.redirectUri,
      code_verifier: request.codeVerifier,
    });
  }

  refresh(refreshToken: string): Promise<FeedTokens> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  verifyWebhook(request: WebhookRequest): FeedNotice | null {
    const signature = header(request.headers, 'x-signature');
    const requestId = header(request.headers, 'x-request-id');
    if (!signature || !requestId) return null;
    const body = (request.body ?? {}) as {
      type?: string;
      action?: string;
      user_id?: number | string;
      data?: { id?: number | string };
    };
    const queryId = request.query['data.id'];
    const dataId =
      typeof queryId === 'string'
        ? queryId
        : body.data?.id !== undefined
          ? String(body.data.id)
          : undefined;
    if (
      !verifyMercadoPagoSignature(this.webhookSecret, signature, requestId, dataId, request.now)
    ) {
      return null;
    }
    const externalUserId = body.user_id !== undefined ? String(body.user_id) : undefined;
    if (
      body.type === 'mp-connect' &&
      body.action === 'application.deauthorized' &&
      externalUserId
    ) {
      return { kind: 'DEAUTHORIZED', requestId, externalUserId };
    }
    if (body.type === 'payment' && externalUserId && dataId) {
      return { kind: 'MOVEMENT', requestId, externalUserId, resourceId: dataId };
    }
    return { kind: 'IGNORED', requestId };
  }

  async getMovement(
    accessToken: string,
    resourceId: string,
    externalUserId: string,
  ): Promise<ExternalMovementInput[]> {
    if (!/^\d+$/.test(resourceId)) return [];
    const payment = await this.get<MpPayment>(accessToken, `/v1/payments/${resourceId}`);
    return payment ? normalizePayment(payment, externalUserId) : [];
  }

  async listSince(
    accessToken: string,
    cursor: string | null,
    since: Date,
    externalUserId: string,
  ): Promise<{ movements: ExternalMovementInput[]; cursor: string }> {
    const from = cursor && Date.parse(cursor) > since.getTime() ? new Date(cursor) : since;
    let last = from;
    const movements: ExternalMovementInput[] = [];
    for (const side of [`collector.id=${externalUserId}`, `payer.id=${externalUserId}`]) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const query =
          `range=date_last_updated&begin_date=${encodeURIComponent(from.toISOString())}` +
          `&end_date=NOW&sort=date_last_updated&criteria=asc&limit=${PAGE}&offset=${page * PAGE}&${side}`;
        const result = await this.get<{ results?: MpPayment[] }>(
          accessToken,
          `/v1/payments/search?${query}`,
        );
        const results = result?.results ?? [];
        for (const payment of results) {
          movements.push(...normalizePayment(payment, externalUserId));
          const updated = payment.date_last_updated ? new Date(payment.date_last_updated) : null;
          if (updated && updated > last) last = updated;
        }
        if (results.length < PAGE) break;
      }
    }
    return { movements, cursor: last.toISOString() };
  }

  private async token(body: Record<string, string>): Promise<FeedTokens> {
    const response = await this.fetcher(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: this.clientId, client_secret: this.clientSecret, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new FeedAuthError();
    }
    if (!response.ok) throw new Error(`Mercado Pago oauth/token answered ${response.status}`);
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user_id?: number | string;
    };
    if (!json.access_token || json.user_id === undefined) {
      throw new Error('Mercado Pago oauth/token answered without a token');
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 15_552_000) * 1000),
      externalUserId: String(json.user_id),
    };
  }

  private async get<T>(accessToken: string, path: string): Promise<T | null> {
    const response = await this.fetcher(`${API}${path}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) throw new FeedAuthError();
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`Mercado Pago ${path.split('?')[0]} answered ${response.status}`);
    return (await response.json()) as T;
  }
}
