import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AUTH_PROVIDER_SLUGS } from '@platin/contracts';
import { resolveProviderSignIn, safeReturnPath } from '@platin/domain';
import { AppException } from '../../common/app-exception';
import { ClockService } from '../../common/clock.service';
import { AppConfig } from '../../config/app-config';
import { AuthProvider, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService, Session, suspended } from '../auth.service';
import { RefreshTokenService } from '../refresh-token.service';
import { LinkTicketService } from './link-ticket.service';
import type { OAuthProfile, OAuthProvider } from './oauth-provider';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import {
  codeChallengeOf,
  OAUTH_TX_TTL_MS,
  OAuthTransaction,
  randomToken,
} from './oauth-transaction';

/** Where the profile lives, for the link flow (AUTH-07). */
export const PROFILE_PATH = '/app/perfil';
/** First stop of a brand-new account, as after signing up with a password. */
export const WELCOME_PATH = '/app/bienvenida';

export interface StartRequest {
  returnTo?: string;
  mode?: string;
  ticket?: string;
  /** The browser's refresh token (platin_rt), required to link: see `linkingUser`. */
  sessionToken?: string;
}

export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  /** All the string parameters of the callback, passed on to the provider as received. */
  parameters: Record<string, string>;
}

export type CallbackResult =
  | { kind: 'session'; session: Session; returnTo: string }
  | { kind: 'linked'; provider: AuthProvider; returnTo: string };

/**
 * The OAuth flow (AUTH-06, AUTH-07), whole in the backend: it ends issuing the same session as
 * the password login, so the rest of the app doesn't change.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OAuthProviderRegistry,
    private readonly tickets: LinkTicketService,
    private readonly auth: AuthService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly clock: ClockService,
    private readonly config: AppConfig,
  ) {}

  /** The provider's authorization URL plus the transaction to keep in the oauth_tx cookie. */
  async start(
    slug: string,
    request: StartRequest,
  ): Promise<{ authorizationUrl: string; transaction: OAuthTransaction }> {
    const provider = this.registry.bySlug(slug);
    const linking = request.mode === 'link';
    const transaction: OAuthTransaction = {
      provider: provider.provider,
      state: randomToken(),
      codeVerifier: randomToken(),
      nonce: randomToken(),
      returnTo: linking ? PROFILE_PATH : safeReturnPath(request.returnTo),
      linkUserId: linking ? await this.linkingUser(request, provider) : undefined,
      expiresAt: this.clock.now().getTime() + OAUTH_TX_TTL_MS,
    };
    const authorizationUrl = await provider.buildAuthorizationUrl({
      state: transaction.state,
      nonce: transaction.nonce,
      codeChallenge: codeChallengeOf(transaction.codeVerifier),
      redirectUri: this.redirectUri(provider),
    });
    return { authorizationUrl, transaction };
  }

  async callback(
    slug: string,
    query: CallbackQuery,
    transaction: OAuthTransaction | undefined,
  ): Promise<CallbackResult> {
    const provider = this.registry.bySlug(slug);
    if (
      !transaction ||
      transaction.provider !== provider.provider ||
      transaction.expiresAt <= this.clock.now().getTime()
    ) {
      throw stateInvalid();
    }
    // The person cancelled on the provider's screen (or the provider refused).
    if (query.error) throw oauthError('OAUTH_CANCELLED', 'The sign-in was cancelled');
    if (!query.code || !query.state || query.state !== transaction.state) throw stateInvalid();

    let profile: OAuthProfile;
    try {
      profile = await provider.exchangeCode({
        code: query.code,
        state: query.state,
        parameters: query.parameters,
        codeVerifier: transaction.codeVerifier,
        nonce: transaction.nonce,
        redirectUri: this.redirectUri(provider),
      });
    } catch (error) {
      this.logger.warn(`Code exchange with ${provider.provider} failed: ${describeError(error)}`);
      throw oauthError('OAUTH_FAILED', 'Could not complete the sign-in with the provider');
    }

    if (transaction.linkUserId) {
      await this.link(transaction.linkUserId, provider, profile);
      return { kind: 'linked', provider: provider.provider, returnTo: transaction.returnTo };
    }
    return this.signIn(provider, profile, transaction.returnTo);
  }

  /**
   * AUTH-07: the user to link to. The ticket says who asked for it; the session cookie proves
   * this browser is theirs. Without the second check, whoever opens a link with someone else's
   * ticket would link their own provider account to that account (link CSRF).
   */
  private async linkingUser(request: StartRequest, provider: OAuthProvider): Promise<string> {
    const ticketUser = this.tickets.consume(request.ticket, provider.provider);
    const sessionUser = await this.refreshTokens.ownerOf(request.sessionToken);
    if (sessionUser !== ticketUser) {
      throw new AppException(
        'LINK_SESSION_MISMATCH',
        HttpStatus.BAD_REQUEST,
        'Linking needs the session of the user who asked for it in this browser',
      );
    }
    return ticketUser;
  }

  /** Absolute URL inside the app (PUBLIC_APP_URL, never the request's host). */
  appUrl(path: string): string {
    return `${this.publicAppUrl()}${path}`;
  }

  /** The "Ingreso con proveedores" rule, applied to the facts in the database. */
  private async signIn(
    provider: OAuthProvider,
    profile: OAuthProfile,
    returnTo: string,
  ): Promise<CallbackResult> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: provider.provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: { select: { id: true, status: true } } },
    });
    const email = profile.email?.trim().toLowerCase() ?? null;
    const decision = resolveProviderSignIn({
      profile,
      linkedUser: identity
        ? { id: identity.user.id, suspended: identity.user.status === 'SUSPENDED' }
        : null,
      emailTaken: email ? (await this.prisma.user.count({ where: { email } })) > 0 : false,
      registrationOpen: identity ? true : await this.auth.registrationOpen(),
      isAdminEmail: email ? this.auth.isAdminEmail(email) : false,
    });

    switch (decision.kind) {
      case 'error':
        throw signInError(decision.code);
      case 'existing':
        if (identity) {
          await this.prisma.authIdentity.update({
            where: { id: identity.id },
            data: { lastUsedAt: this.clock.now(), email },
          });
        }
        return {
          kind: 'session',
          session: await this.auth.startSession(decision.userId),
          returnTo,
        };
      case 'create': {
        const user = await this.createUser(provider, profile, decision.email);
        return {
          kind: 'session',
          session: await this.auth.startSession(user.id),
          returnTo: WELCOME_PATH,
        };
      }
    }
  }

  private async createUser(
    provider: OAuthProvider,
    profile: OAuthProfile,
    email: string,
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.auth.createUser(tx, {
          email,
          passwordHash: null,
          name: profile.name?.trim().slice(0, 80) || null,
        });
        await tx.authIdentity.create({
          data: {
            userId: user.id,
            provider: provider.provider,
            providerUserId: profile.providerUserId,
            email,
            lastUsedAt: this.clock.now(),
          },
        });
        return user;
      });
    } catch (error) {
      // Someone created that email (or that identity) at the same time.
      if (isUniqueViolation(error)) throw signInError('ACCOUNT_EXISTS_LINK_REQUIRED');
      throw error;
    }
  }

  /** AUTH-07: links the provider identity to the signed-in account that asked for it. */
  private async link(
    userId: string,
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, identities: { where: { provider: provider.provider } } },
    });
    if (!user) throw stateInvalid();
    if (user.status === 'SUSPENDED') throw suspended();
    const existing = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: provider.provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (existing && existing.userId !== userId) throw identityInUse();
    if (existing) return; // already linked to this same account
    if (user.identities.length > 0) {
      throw new AppException(
        'PROVIDER_ALREADY_LINKED',
        HttpStatus.CONFLICT,
        'The account already has another identity of that provider',
      );
    }
    if (!profile.email || !profile.emailVerified) throw signInError('EMAIL_NOT_VERIFIED');
    try {
      await this.prisma.authIdentity.create({
        data: {
          userId,
          provider: provider.provider,
          providerUserId: profile.providerUserId,
          email: profile.email.trim().toLowerCase(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw identityInUse();
      throw error;
    }
  }

  private redirectUri(provider: OAuthProvider): string {
    return this.appUrl(`/api/v1/auth/oauth/${AUTH_PROVIDER_SLUGS[provider.provider]}/callback`);
  }

  private publicAppUrl(): string {
    // Required by the env validation whenever a provider is enabled.
    const url = this.config.env.PUBLIC_APP_URL;
    if (!url) throw new Error('PUBLIC_APP_URL is not set');
    return url;
  }
}

function oauthError(code: string, detail: string): AppException {
  return new AppException(code, HttpStatus.BAD_REQUEST, detail);
}

function stateInvalid(): AppException {
  return oauthError('OAUTH_STATE_INVALID', 'The sign-in expired or was started elsewhere');
}

function identityInUse(): AppException {
  return new AppException(
    'IDENTITY_IN_USE',
    HttpStatus.CONFLICT,
    'That provider account is already linked to another platin account',
  );
}

function signInError(code: string): AppException {
  switch (code) {
    case 'ACCOUNT_SUSPENDED':
      return suspended();
    case 'REGISTRATION_CLOSED':
      return new AppException(code, HttpStatus.FORBIDDEN, 'Sign-up is closed for now');
    case 'ACCOUNT_EXISTS_LINK_REQUIRED':
      return new AppException(
        code,
        HttpStatus.CONFLICT,
        'There is already an account with that email: sign in with the password and link it',
      );
    default:
      return oauthError(code, 'The provider did not confirm the email');
  }
}

/** The error and its causes (openid-client wraps the useful detail), without tokens. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && parts.length < 4) {
    const code = (current as { code?: unknown }).code;
    parts.push(
      `${current.name}: ${current.message}${typeof code === 'string' ? ` [${code}]` : ''}`,
    );
    current = current.cause;
  }
  return parts.length > 0 ? parts.join(' <- ') : String(error);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
