// Phase 40 probe (docs/plan.md, "Fase 40"): what does the Mercado Pago API report about a
// personal account? Not production code: it runs on your machine, against your own account.
//
//   pnpm nx run api:mp-probe --args="auth"          OAuth with PKCE; keeps the token in .mp-probe/
//   pnpm nx run api:mp-probe --args="fetch"         queries the candidate endpoints (last 30 days)
//   pnpm nx run api:mp-probe --args="refresh"       renews the token with the refresh token
//   pnpm nx run api:mp-probe --args="webhook"       receives webhooks (behind an HTTPS tunnel)
//   pnpm nx run api:mp-probe --args="webhook --fail"  same, answering 500 to see the retries
//
// Reads MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET and MERCADOPAGO_WEBHOOK_SECRET from the
// environment (Nx loads .env). Never prints credentials. Raw responses go to apps/api/.mp-probe/
// (ignored by git); what is printed and written to .mp-probe/anon.md is anonymized: ids hashed,
// names, emails, CVU and amounts replaced, so it can be pasted into docs/adr/anexos/.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const API = 'https://api.mercadopago.com';
const AUTH = 'https://auth.mercadopago.com/authorization';
const DIR = join(__dirname, '..', '.mp-probe');
const TOKEN_FILE = join(DIR, 'token.json');
const ANON_FILE = join(DIR, 'anon.md');
const CALLBACK_PORT = Number(process.env['MP_PROBE_PORT'] ?? 4200);
const REDIRECT_URI =
  process.env['MP_PROBE_REDIRECT_URI'] ??
  `http://localhost:${CALLBACK_PORT}/api/v1/feeds/mercado-pago/callback`;

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  user_id: number;
  expires_in: number;
  obtained_at: string;
  scope?: string;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in .env.`);
    process.exit(1);
  }
  return value;
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function save(name: string, data: unknown): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, name), JSON.stringify(data, null, 2));
}

function loadToken(): StoredToken {
  if (!existsSync(TOKEN_FILE)) {
    console.error('No token yet: run the "auth" step first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as StoredToken;
}

// --- anonymization -----------------------------------------------------------------------------

const SENSITIVE_KEYS =
  /^(first_name|last_name|name|nickname|email|identification|number|phone|area_code|cvu|cbu|alias|address|street_name|zip_code|description|reason|title|statement_descriptor|external_reference|card_holder|cardholder|holder|ip_address|bank_transfer_id|financial_institution|last_four_digits|first_six_digits)$/i;
const AMOUNT_KEYS = /amount|balance|total|fee|net|price|value/i;
const ID_KEYS = /(^id$|_id$|^collector$|^payer$)/i;

function hashId(value: unknown): string {
  return 'id_' + createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

/** Keeps the shape (keys, types, enums, dates) and hides what identifies a person or a sum. */
export function anonymize(value: unknown, key = ''): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => anonymize(item, key));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, anonymize(v, k)]),
    );
  }
  if (SENSITIVE_KEYS.test(key)) return typeof value === 'string' ? '«texto»' : '«dato»';
  if (typeof value === 'number' && AMOUNT_KEYS.test(key)) return value === 0 ? 0 : '«monto»';
  if (typeof value === 'string' && AMOUNT_KEYS.test(key) && /^-?\d+(\.\d+)?$/.test(value)) {
    return '«monto»';
  }
  if (ID_KEYS.test(key) && (typeof value === 'number' || typeof value === 'string')) {
    return hashId(value);
  }
  return value;
}

function anonLog(title: string, data: unknown): void {
  const block = `\n### ${title}\n\n\`\`\`json\n${JSON.stringify(anonymize(data), null, 2)}\n\`\`\`\n`;
  appendFileSync(ANON_FILE, block);
  console.log(block);
}

// --- OAuth ---------------------------------------------------------------------------------------

async function tokenRequest(body: Record<string, string>): Promise<StoredToken> {
  const response = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    // The error body has no secrets, but it is trimmed anyway.
    throw new Error(`oauth/token ${response.status}: ${String(json['message'] ?? json['error'])}`);
  }
  return { ...(json as unknown as StoredToken), obtained_at: new Date().toISOString() };
}

async function auth(): Promise<void> {
  const clientId = env('MERCADOPAGO_CLIENT_ID');
  const clientSecret = env('MERCADOPAGO_CLIENT_SECRET');
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));
  const url = new URL(AUTH);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  console.log(`Abrí esta URL en el navegador e iniciá sesión con tu cuenta de Mercado Pago:\n\n${url}\n`);
  console.log(`Esperando la vuelta en ${REDIRECT_URI} (cortá "nx serve web" si está en ${CALLBACK_PORT})…`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const incoming = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`);
      if (!incoming.pathname.endsWith('/callback')) {
        res.writeHead(404).end();
        return;
      }
      const received = incoming.searchParams.get('code');
      const ok = received && incoming.searchParams.get('state') === state;
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(ok ? 'Listo, volvé a la terminal.' : 'state o code inválidos.');
      server.close();
      if (ok) resolve(received);
      else reject(new Error(`Callback without a valid code/state: ${incoming.searchParams.get('error') ?? ''}`));
    });
    server.listen(CALLBACK_PORT);
  });

  const started = Date.now();
  let token: StoredToken;
  let pkce = true;
  try {
    token = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
  } catch (error) {
    // Records whether PKCE is what breaks; a code can only be used once, so retrying needs a new auth.
    pkce = false;
    throw error;
  }
  save('token.json', token);
  anonLog('oauth/token (authorization_code)', {
    pkce,
    ms: Date.now() - started,
    fields: Object.keys(token),
    expires_in: token.expires_in,
    scope: token.scope,
    has_refresh_token: Boolean(token.refresh_token),
  });
  console.log('Token guardado en apps/api/.mp-probe/token.json (ignorado por git).');
}

async function refresh(): Promise<void> {
  const current = loadToken();
  if (!current.refresh_token) throw new Error('The token has no refresh_token.');
  const token = await tokenRequest({
    client_id: env('MERCADOPAGO_CLIENT_ID'),
    client_secret: env('MERCADOPAGO_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
  });
  save('token.json', token);
  anonLog('oauth/token (refresh_token)', {
    expires_in: token.expires_in,
    refresh_token_rotated: token.refresh_token !== current.refresh_token,
  });
}

// --- endpoints -----------------------------------------------------------------------------------

async function get(token: string, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // CSV reports and HTML errors stay as text.
  }
  return { status: response.status, body };
}

function summarizePayments(body: unknown): unknown {
  const results = ((body as { results?: Record<string, unknown>[] })?.results ?? []) as Record<
    string,
    unknown
  >[];
  return results.map((p) => ({
    operation_type: p['operation_type'],
    payment_type_id: p['payment_type_id'],
    payment_method_id: p['payment_method_id'],
    status: p['status'],
    status_detail: p['status_detail'],
    currency_id: p['currency_id'],
    date_created: p['date_created'],
    date_approved: p['date_approved'],
    money_release_date: p['money_release_date'],
    point_of_interaction_type: (p['point_of_interaction'] as { type?: string } | undefined)?.type,
    has_fee_details: Array.isArray(p['fee_details']) && (p['fee_details'] as unknown[]).length > 0,
    net_differs_from_amount:
      (p['transaction_details'] as { net_received_amount?: number } | undefined)?.net_received_amount !==
      p['transaction_amount'],
    refunds: Array.isArray(p['refunds']) ? (p['refunds'] as unknown[]).length : 0,
  }));
}

async function fetchAll(): Promise<void> {
  const { access_token: token, user_id: userId } = loadToken();
  writeFileSync(ANON_FILE, `# Mercado Pago: salida anonimizada de la prueba (${new Date().toISOString().slice(0, 10)})\n`);
  const range = 'range=date_created&begin_date=NOW-30DAYS&end_date=NOW&sort=date_created&criteria=desc&limit=100';
  const candidates: [string, string][] = [
    ['users/me', '/users/me'],
    ['payments/search como cobrador', `/v1/payments/search?${range}&collector.id=${userId}`],
    ['payments/search como pagador', `/v1/payments/search?${range}&payer.id=${userId}`],
    ['merchant_orders/search', `/merchant_orders/search?limit=50`],
    ['saldo de la cuenta', `/users/${userId}/mercadopago_account/balance`],
    ['movimientos de la cuenta', `/mercadopago_account/movements/search?limit=50`],
    ['reservas (asset management)', `/v1/asset_management/investments`],
    ['reporte de liberaciones: lista', '/v1/account/release_report/list'],
    ['reporte de dinero en cuenta: lista', '/v1/account/settlement_report/list'],
  ];
  for (const [title, path] of candidates) {
    const started = Date.now();
    const { status, body } = await get(token, path);
    save(`${title.replace(/[^a-z0-9]+/gi, '-')}.json`, { status, body });
    const isPaymentSearch = path.startsWith('/v1/payments/search');
    anonLog(`${title} → ${status} (${Date.now() - started} ms)`, {
      path: path.replace(String(userId), '{user_id}'),
      ...(isPaymentSearch
        ? { paging: (body as { paging?: unknown })?.paging, movimientos: summarizePayments(body) }
        : { body }),
    });
  }
  // One full payment of each search, to see every field (anonymized).
  for (const name of ['payments-search-como-cobrador', 'payments-search-como-pagador']) {
    const file = join(DIR, `${name}.json`);
    const first = (JSON.parse(readFileSync(file, 'utf8')) as { body?: { results?: { id: number }[] } })
      .body?.results?.[0];
    if (!first) continue;
    const { status, body } = await get(token, `/v1/payments/${first.id}`);
    save(`payment-${name}.json`, body);
    anonLog(`v1/payments/{id} (${name}) → ${status}`, body);
  }
  console.log(`\nSalida anonimizada en apps/api/.mp-probe/anon.md. Revisala antes de copiarla al anexo.`);
}

// --- webhooks ------------------------------------------------------------------------------------

export function verifySignature(
  secret: string,
  signature: string | undefined,
  requestId: string | undefined,
  dataId: string | undefined,
): { ok: boolean; ts?: number } {
  if (!signature || !requestId) return { ok: false };
  const parts = Object.fromEntries(
    signature.split(',').map((part) => part.trim().split('=', 2) as [string, string]),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return { ok: false };
  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `${id ? `id:${id};` : ''}request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return { ok: a.length === b.length && timingSafeEqual(a, b), ts: Number(ts) };
}

function webhook(fail: boolean): void {
  const secret = env('MERCADOPAGO_WEBHOOK_SECRET');
  const port = Number(process.env['MP_PROBE_WEBHOOK_PORT'] ?? 3999);
  const seen = new Map<string, number>();
  mkdirSync(DIR, { recursive: true });
  createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      } catch {
        // Some topics (legacy IPN) come only as query parameters.
      }
      const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? undefined;
      const requestId = req.headers['x-request-id'] as string | undefined;
      const { ok, ts } = verifySignature(secret, req.headers['x-signature'] as string | undefined, requestId, dataId);
      const created = typeof body['date_created'] === 'string' ? Date.parse(body['date_created']) : NaN;
      const key = `${body['type'] ?? url.searchParams.get('topic')}:${dataId}`;
      const attempt = (seen.get(key) ?? 0) + 1;
      seen.set(key, attempt);
      const entry = {
        at: new Date().toISOString(),
        topic: body['type'] ?? url.searchParams.get('topic') ?? url.searchParams.get('type'),
        action: body['action'],
        api_version: body['api_version'],
        signature_ok: ok,
        ts_skew_s: ts ? Math.round(Date.now() / 1000 - (ts > 1e12 ? ts / 1000 : ts)) : null,
        delay_s: Number.isNaN(created) ? null : Math.round((Date.now() - created) / 1000),
        attempt,
        data_id: dataId ? hashId(dataId) : null,
        answered: fail ? 500 : 200,
      };
      appendFileSync(join(DIR, 'webhooks.jsonl'), JSON.stringify(entry) + '\n');
      save(`webhook-${Date.now()}.json`, { query: Object.fromEntries(url.searchParams), headers: req.headers, body });
      console.log(JSON.stringify(entry));
      res.writeHead(fail ? 500 : 200).end();
    });
  }).listen(port, () => {
    console.log(`Webhooks en http://localhost:${port}/ (exponelo con un túnel HTTPS y cargá esa URL en Mercado Pago).`);
    console.log(fail ? 'Respondiendo 500 a todo para ver los reintentos.' : 'Respondiendo 200.');
  });
}

// --- main ----------------------------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const run: Record<string, () => Promise<void> | void> = {
  auth,
  refresh,
  fetch: fetchAll,
  webhook: () => webhook(rest.includes('--fail')),
};
if (!command || !run[command]) {
  console.error('Usage: mp-probe <auth|fetch|refresh|webhook [--fail]>');
  process.exit(1);
}
Promise.resolve(run[command]()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
