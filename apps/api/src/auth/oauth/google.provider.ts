import * as oidc from 'openid-client';
import type {
  AuthorizationRequest,
  CodeExchange,
  OAuthProfile,
  OAuthProvider,
} from './oauth-provider';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');
// The basic scopes, which Google doesn't require verifying the app for.
const SCOPES = 'openid email profile';

/** Google sign-in over OpenID Connect, with discovery, PKCE and id_token verification. */
export class GoogleProvider implements OAuthProvider {
  readonly provider = 'GOOGLE' as const;
  private configuration?: Promise<oidc.Configuration>;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async buildAuthorizationUrl(request: AuthorizationRequest): Promise<string> {
    const url = oidc.buildAuthorizationUrl(await this.config(), {
      redirect_uri: request.redirectUri,
      scope: SCOPES,
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return url.href;
  }

  async exchangeCode(exchange: CodeExchange): Promise<OAuthProfile> {
    // Every parameter Google sent, not only code and state: it also sends "iss" (RFC 9207),
    // which openid-client requires because Google's metadata announces it.
    const callbackUrl = new URL(exchange.redirectUri);
    for (const [name, value] of Object.entries(exchange.parameters)) {
      callbackUrl.searchParams.set(name, value);
    }
    // openid-client takes redirect_uri from this URL (without its query).
    const tokens = await oidc.authorizationCodeGrant(await this.config(), callbackUrl, {
      pkceCodeVerifier: exchange.codeVerifier,
      expectedState: exchange.state,
      expectedNonce: exchange.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims) throw new Error('Google did not return an id_token');
    return {
      providerUserId: claims.sub,
      email: typeof claims['email'] === 'string' ? claims['email'] : null,
      emailVerified: claims['email_verified'] === true,
      name: typeof claims['name'] === 'string' ? claims['name'] : null,
    };
  }

  /** Discovery runs once, on first use; a failure is retried on the next sign-in. */
  private config(): Promise<oidc.Configuration> {
    this.configuration ??= oidc
      .discovery(GOOGLE_ISSUER, this.clientId, this.clientSecret)
      .catch((error: unknown) => {
        this.configuration = undefined;
        throw error;
      });
    return this.configuration;
  }
}
