import type { ExternalMovementInput, FeedProvider } from '@platin/domain';

/** What the institution answers when the code or the refresh token is exchanged. */
export interface FeedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  /** The person's id in the institution (Mercado Pago's user_id). */
  externalUserId: string;
}

/** A webhook, once its signature was checked. */
export type FeedNotice =
  | { kind: 'MOVEMENT'; requestId: string; externalUserId: string; resourceId: string }
  | { kind: 'DEAUTHORIZED'; requestId: string; externalUserId: string }
  /** A topic platin does not read: acknowledged so it is not retried. */
  | { kind: 'IGNORED'; requestId: string };

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body: unknown;
  now: Date;
}

/** The token was revoked or expired: the connection needs the person to connect again. */
export class FeedAuthError extends Error {
  constructor(message = 'The institution rejected the credentials') {
    super(message);
    this.name = 'FeedAuthError';
  }
}

/**
 * A connection with an institution (ADR 0037). Mercado Pago is the first implementation, as
 * DolarApi is of RateProvider; tests replace it with a fake. Everything comes back normalized:
 * the rest of platin never reads the institution's own formats.
 */
export interface AccountFeedProvider {
  readonly provider: FeedProvider;
  buildAuthorizationUrl(request: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  exchangeCode(request: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<FeedTokens>;
  refresh(refreshToken: string): Promise<FeedTokens>;
  /** Null when the signature is missing, wrong or too old (the webhook answers 401). */
  verifyWebhook(request: WebhookRequest): FeedNotice | null;
  /**
   * The movements behind a notice: a payment and, once refunded, its refunds. Empty when it is
   * not finished (pending, rejected, cancelled).
   */
  getMovement(
    accessToken: string,
    resourceId: string,
    externalUserId: string,
  ): Promise<ExternalMovementInput[]>;
  /**
   * What happened after `cursor` (never before `since`), and the cursor to continue from. The
   * backup sync uses it to recover what the webhook did not bring.
   */
  listSince(
    accessToken: string,
    cursor: string | null,
    since: Date,
    externalUserId: string,
  ): Promise<{ movements: ExternalMovementInput[]; cursor: string }>;
}

/** Injection token with the providers enabled by configuration. */
export const FEED_PROVIDERS = Symbol('FEED_PROVIDERS');
