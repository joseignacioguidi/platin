import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const OAUTH_TX_COOKIE = 'oauth_tx';
export const OAUTH_TX_COOKIE_PATH = '/api/v1/auth/oauth';
export const OAUTH_TX_TTL_MS = 10 * 60_000;

/**
 * What the API needs to remember between /start and /callback. It travels in the signed,
 * httpOnly oauth_tx cookie, so the server keeps no state for sign-ins in progress.
 */
export const oauthTransactionSchema = z.object({
  provider: z.enum(['GOOGLE', 'FACEBOOK', 'APPLE']),
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  nonce: z.string().min(1),
  returnTo: z.string(),
  /** Set when linking a provider to a signed-in account instead of signing in. */
  linkUserId: z.string().optional(),
  /** Epoch ms; checked on the server too, not only through the cookie's Max-Age. */
  expiresAt: z.number(),
});

export type OAuthTransaction = z.infer<typeof oauthTransactionSchema>;

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** PKCE S256 challenge of a verifier (RFC 7636). */
export function codeChallengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
