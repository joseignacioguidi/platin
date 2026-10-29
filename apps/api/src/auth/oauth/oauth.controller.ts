import { Controller, Get, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  AUTH_PROVIDER_SLUGS,
  authProvidersResponseSchema,
  type AuthProvidersResponse,
  linkTicketResponseSchema,
  type LinkTicketResponse,
} from '@platin/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AppException } from '../../common/app-exception';
import { AuthUser, CurrentUser } from '../../common/current-user.decorator';
import { Public } from '../../common/public.decorator';
import { AppConfig } from '../../config/app-config';
import { SessionCookie } from '../session-cookie';
import { LinkTicketService } from './link-ticket.service';
import { OAuthProviderRegistry } from './oauth-provider.registry';
import {
  OAUTH_TX_COOKIE,
  OAUTH_TX_COOKIE_PATH,
  OAUTH_TX_TTL_MS,
  OAuthTransaction,
  oauthTransactionSchema,
} from './oauth-transaction';
import { OAuthService, PROFILE_PATH } from './oauth.service';

class AuthProvidersResponseDto extends createZodDto(authProvidersResponseSchema) {}
class LinkTicketResponseDto extends createZodDto(linkTicketResponseSchema) {}

const SIGN_IN_PATH = '/ingresar';
const DONE_PATH = '/auth/listo';

/**
 * AUTH-06 and AUTH-07. /start and /callback are full-page navigations, so they always answer
 * with a redirect: errors go back to the app as `?error=CODE`, never as a JSON page.
 */
@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly registry: OAuthProviderRegistry,
    private readonly tickets: LinkTicketService,
    private readonly session: SessionCookie,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('providers')
  @ZodSerializerDto(AuthProvidersResponseDto)
  providers(): AuthProvidersResponse {
    return { providers: this.registry.enabled() };
  }

  @Post('oauth/:provider/link-ticket')
  @ZodSerializerDto(LinkTicketResponseDto)
  linkTicket(@CurrentUser() user: AuthUser, @Param('provider') slug: string): LinkTicketResponse {
    const { provider } = this.registry.bySlug(slug);
    const { ticket, expiresAt } = this.tickets.issue(user.id, provider);
    return { ticket, expiresAt: expiresAt.toISOString() };
  }

  @Public()
  @Get('oauth/:provider/start')
  async start(
    @Param('provider') slug: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const linking = query['mode'] === 'link';
    try {
      const { authorizationUrl, transaction } = await this.oauth.start(slug, {
        returnTo: text(query['returnTo']),
        mode: text(query['mode']),
        ticket: text(query['ticket']),
      });
      res.cookie(OAUTH_TX_COOKIE, JSON.stringify(transaction), {
        ...this.txCookieOptions(),
        signed: true,
        maxAge: OAUTH_TX_TTL_MS,
      });
      res.redirect(302, authorizationUrl);
    } catch (error) {
      this.fail(res, error, linking ? PROFILE_PATH : SIGN_IN_PATH);
    }
  }

  @Public()
  @Get('oauth/:provider/callback')
  async callback(
    @Param('provider') slug: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const transaction = readTransaction(req);
    res.clearCookie(OAUTH_TX_COOKIE, this.txCookieOptions());
    try {
      const result = await this.oauth.callback(
        slug,
        {
          code: text(query['code']),
          state: text(query['state']),
          error: text(query['error']),
          parameters: stringParameters(query),
        },
        transaction,
      );
      if (result.kind === 'linked') {
        const linked = AUTH_PROVIDER_SLUGS[result.provider];
        res.redirect(302, this.oauth.appUrl(`${result.returnTo}?vinculado=${linked}`));
        return;
      }
      this.session.set(res, result.session.refreshToken);
      const returnTo = encodeURIComponent(result.returnTo);
      res.redirect(302, this.oauth.appUrl(`${DONE_PATH}?returnTo=${returnTo}`));
    } catch (error) {
      this.fail(res, error, transaction?.linkUserId ? PROFILE_PATH : SIGN_IN_PATH);
    }
  }

  /** Back to the app with a stable code the screen turns into a message. */
  private fail(res: Response, error: unknown, path: string): void {
    const code = error instanceof AppException ? error.code : 'OAUTH_FAILED';
    if (!(error instanceof AppException)) this.logger.error(error);
    // No provider is enabled, so there is no app address to go back to: plain Problem Details.
    if (!this.config.env.PUBLIC_APP_URL) throw error;
    res.redirect(302, this.oauth.appUrl(`${path}?error=${encodeURIComponent(code)}`));
  }

  private txCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: OAUTH_TX_COOKIE_PATH,
    };
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** The single-valued string parameters of a query (repeated ones are dropped, never merged). */
function stringParameters(query: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** The signed oauth_tx cookie, or undefined when missing, tampered with or malformed. */
function readTransaction(req: Request): OAuthTransaction | undefined {
  const signed = req.signedCookies as Record<string, unknown> | undefined;
  const raw = signed?.[OAUTH_TX_COOKIE];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = oauthTransactionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
