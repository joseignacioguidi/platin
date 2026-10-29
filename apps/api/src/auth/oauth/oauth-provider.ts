import type { AuthProvider } from '../../generated/prisma/client';

export interface AuthorizationRequest {
  state: string;
  codeChallenge: string;
  nonce: string;
  redirectUri: string;
}

export interface CodeExchange {
  code: string;
  state: string;
  /** Every query parameter of the callback (code, state, iss, scope...), as received. */
  parameters: Record<string, string>;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
}

/** The person as the provider reports it, after verifying its response. */
export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * One external sign-in provider (AUTH-06). Google is the only implementation for now; Facebook
 * and Apple are added as new classes plus their environment variables.
 */
export interface OAuthProvider {
  readonly provider: AuthProvider;
  /** Where to send the browser to sign in (PKCE, state and nonce included). */
  buildAuthorizationUrl(request: AuthorizationRequest): Promise<string>;
  /** Exchanges the callback code and verifies the identity (signature, audience, nonce). */
  exchangeCode(exchange: CodeExchange): Promise<OAuthProfile>;
}

/** Injection token with the providers enabled by configuration. */
export const OAUTH_PROVIDERS = Symbol('OAUTH_PROVIDERS');
