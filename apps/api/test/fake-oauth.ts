import { createHash } from 'node:crypto';
import type {
  AuthorizationRequest,
  CodeExchange,
  OAuthProfile,
  OAuthProvider,
} from '../src/auth/oauth/oauth-provider';

export const FAKE_ISSUER = 'https://idp.fake';

/**
 * Stands in for Google: the "authorization page" is a URL with the request in its query, and
 * each code the test hands out maps to a profile. It checks PKCE and the nonce like the real
 * provider would, so a broken flow fails here too.
 */
export class FakeGoogleProvider implements OAuthProvider {
  readonly provider = 'GOOGLE' as const;
  private readonly codes = new Map<string, OAuthProfile>();
  private readonly requests = new Map<string, AuthorizationRequest>();

  /** Registers a code the callback can exchange for this profile. */
  code(profile: Partial<OAuthProfile> & { providerUserId: string }): string {
    const code = `code-${this.codes.size + 1}-${profile.providerUserId}`;
    this.codes.set(code, { email: null, emailVerified: true, name: null, ...profile });
    return code;
  }

  async buildAuthorizationUrl(request: AuthorizationRequest): Promise<string> {
    this.requests.set(request.state, request);
    const url = new URL('https://idp.fake/authorize');
    url.searchParams.set('state', request.state);
    url.searchParams.set('redirect_uri', request.redirectUri);
    return url.href;
  }

  async exchangeCode(exchange: CodeExchange): Promise<OAuthProfile> {
    const request = this.requests.get(exchange.state);
    const profile = this.codes.get(exchange.code);
    const challenge = createHash('sha256').update(exchange.codeVerifier).digest('base64url');
    if (!request || !profile) throw new Error('invalid_grant');
    if (challenge !== request.codeChallenge || exchange.nonce !== request.nonce) {
      throw new Error('PKCE or nonce mismatch');
    }
    if (exchange.redirectUri !== request.redirectUri) throw new Error('redirect_uri mismatch');
    // Like Google (RFC 9207): the callback carries "iss" and it must reach the provider.
    if (exchange.parameters['iss'] !== FAKE_ISSUER) throw new Error('iss missing');
    this.codes.delete(exchange.code);
    return profile;
  }
}
