import type { ExternalMovementInput } from '@platin/domain';
import { createHash } from 'node:crypto';
import {
  type AccountFeedProvider,
  FeedAuthError,
  type FeedNotice,
  type FeedTokens,
  type WebhookRequest,
} from '../src/feeds/account-feed-provider';

export const FAKE_SIGNATURE = 'valid-signature';

/**
 * Stands in for Mercado Pago: the authorization page is a URL with the request in its query,
 * each code maps to an institution user, notices are "signed" with a fixed header and the
 * movements are whatever the test registers. It checks PKCE like the real one would.
 */
export class FakeFeedProvider implements AccountFeedProvider {
  readonly provider = 'MERCADO_PAGO' as const;
  /** resourceId → what GET /v1/payments/:id would turn into. */
  readonly resources = new Map<string, ExternalMovementInput[]>();
  /** What the backup sync lists. */
  history: ExternalMovementInput[] = [];
  /** Access tokens the institution no longer accepts. */
  readonly revoked = new Set<string>();
  down = false;
  refreshFails = false;
  refreshed = 0;
  /** The last access token handed out. */
  lastAccessToken = '';
  private readonly challenges = new Map<string, string>();
  private readonly codes = new Map<string, { externalUserId: string; state: string }>();
  private tokens = 0;

  reset(): void {
    this.resources.clear();
    this.history = [];
    this.revoked.clear();
    this.down = false;
    this.refreshFails = false;
    this.refreshed = 0;
  }

  buildAuthorizationUrl(request: { state: string; codeChallenge: string; redirectUri: string }) {
    this.challenges.set(request.state, request.codeChallenge);
    const url = new URL('https://mp.fake/authorization');
    url.searchParams.set('state', request.state);
    url.searchParams.set('redirect_uri', request.redirectUri);
    return url.toString();
  }

  /** A code the callback can exchange, for the authorization started with `state`. */
  code(state: string, externalUserId: string): string {
    const code = `code-${this.codes.size + 1}`;
    this.codes.set(code, { externalUserId, state });
    return code;
  }

  async exchangeCode(request: { code: string; codeVerifier: string }): Promise<FeedTokens> {
    const issued = this.codes.get(request.code);
    if (!issued) throw new FeedAuthError();
    this.codes.delete(request.code);
    const challenge = createHash('sha256').update(request.codeVerifier).digest('base64url');
    if (this.challenges.get(issued.state) !== challenge) throw new FeedAuthError('PKCE mismatch');
    return this.issue(issued.externalUserId);
  }

  async refresh(refreshToken: string): Promise<FeedTokens> {
    if (this.refreshFails) throw new FeedAuthError();
    this.refreshed += 1;
    return this.issue(refreshToken.replace(/^refresh-/, '').replace(/-\d+$/, ''));
  }

  verifyWebhook(request: WebhookRequest): FeedNotice | null {
    const requestId = request.headers['x-request-id'] as string | undefined;
    if (request.headers['x-signature'] !== FAKE_SIGNATURE || !requestId) return null;
    const body = request.body as { type?: string; user_id?: string; data?: { id?: string } };
    if (body.type === 'mp-connect' && body.user_id) {
      return { kind: 'DEAUTHORIZED', requestId, externalUserId: body.user_id };
    }
    if (body.type === 'payment' && body.user_id && body.data?.id) {
      return {
        kind: 'MOVEMENT',
        requestId,
        externalUserId: body.user_id,
        resourceId: body.data.id,
      };
    }
    return { kind: 'IGNORED', requestId };
  }

  async getMovement(accessToken: string, resourceId: string): Promise<ExternalMovementInput[]> {
    this.check(accessToken);
    return this.resources.get(resourceId) ?? [];
  }

  async listSince(
    accessToken: string,
  ): Promise<{ movements: ExternalMovementInput[]; cursor: string }> {
    this.check(accessToken);
    return { movements: this.history, cursor: new Date().toISOString() };
  }

  private check(accessToken: string): void {
    if (this.revoked.has(accessToken)) throw new FeedAuthError();
    if (this.down) throw new Error('Mercado Pago is down');
  }

  private issue(externalUserId: string): FeedTokens {
    this.tokens += 1;
    this.lastAccessToken = `access-${externalUserId}-${this.tokens}`;
    return {
      accessToken: this.lastAccessToken,
      refreshToken: `refresh-${externalUserId}-${this.tokens}`,
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      externalUserId,
    };
  }
}
