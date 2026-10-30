import { createHmac } from 'node:crypto';

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Signs an HS256 JWT by hand, so tests can forge tokens the API must reject. */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

/** A token with `alg: none` and no signature. */
export function unsignedJwt(payload: Record<string, unknown>): string {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

export function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);
