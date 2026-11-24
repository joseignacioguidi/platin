import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  assignFeedReserveRequestSchema,
  convertTransactionRequestSchema,
  convertTransactionResponseSchema,
  feedConnectResponseSchema,
  feedReserveSchema,
  feedsResponseSchema,
  feedUsageSchema,
  heldMovementSchema,
  idParamSchema,
  retryHeldResponseSchema,
  unlinkExternalMovementResponseSchema,
  updateFeedRequestSchema,
  type ConvertTransactionResponse,
  type FeedConnectResponse,
  type FeedReserve,
  type FeedsResponse,
  type FeedUsage,
  type HeldMovement,
  type RetryHeldResponse,
  type UnlinkExternalMovementResponse,
} from '@platin/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { type AccountFeedProvider, FeedAuthError, type FeedNotice } from './account-feed-provider';
import { FeedIngestService } from './feed-ingest.service';
import {
  FEED_TX_COOKIE,
  FEED_TX_COOKIE_PATH,
  FEED_TX_TTL_MS,
  type FeedTransaction,
  FeedProviderRegistry,
  feedTransactionSchema,
} from './feed-provider.registry';
import { FeedTokenCipher } from './feed-token-cipher';
import { FEED_PROFILE_PATH, FeedsService } from './feeds.service';

class FeedsResponseDto extends createZodDto(feedsResponseSchema) {}
class ConnectResponseDto extends createZodDto(feedConnectResponseSchema) {}
class UpdateFeedDto extends createZodDto(updateFeedRequestSchema) {}
class ReserveDto extends createZodDto(feedReserveSchema) {}
class AssignReserveDto extends createZodDto(assignFeedReserveRequestSchema) {}
class HeldDto extends createZodDto(heldMovementSchema) {}
class RetryDto extends createZodDto(retryHeldResponseSchema) {}
class UsageDto extends createZodDto(feedUsageSchema) {}
class ConvertDto extends createZodDto(convertTransactionRequestSchema) {}
class ConvertResponseDto extends createZodDto(convertTransactionResponseSchema) {}
class UnlinkResponseDto extends createZodDto(unlinkExternalMovementResponseSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class ProviderIdParamDto extends createZodDto(
  z.object({ provider: z.string().max(40), id: z.uuid() }),
) {}

/** The connection from the profile (MPG-01, 05, 07, 09, 10). */
@Controller('feeds')
export class FeedsController {
  private readonly logger = new Logger(FeedsController.name);

  constructor(
    private readonly feeds: FeedsService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @ZodSerializerDto(FeedsResponseDto)
  list(@CurrentUser() user: AuthUser): Promise<FeedsResponse> {
    return this.feeds.list(user.id);
  }

  /** Sets feed_tx in this same response: only a platin screen with a session starts a connection. */
  @Post(':provider/connect')
  @HttpCode(200)
  @ZodSerializerDto(ConnectResponseDto)
  async connect(
    @CurrentUser() user: AuthUser,
    @Param('provider') slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FeedConnectResponse> {
    const { authorizationUrl, transaction } = await this.feeds.connect(user.id, slug);
    res.cookie(FEED_TX_COOKIE, JSON.stringify(transaction), {
      ...this.txCookieOptions(),
      signed: true,
      maxAge: FEED_TX_TTL_MS,
    });
    return { authorizationUrl };
  }

  /** A full-page navigation from the institution: it always answers with a redirect. */
  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') slug: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const transaction = readTransaction(req);
    res.clearCookie(FEED_TX_COOKIE, this.txCookieOptions());
    const back = (suffix: string) =>
      res.redirect(302, `${this.config.env.PUBLIC_APP_URL ?? ''}${FEED_PROFILE_PATH}?${suffix}`);
    try {
      await this.feeds.callback(
        slug,
        { code: text(query['code']), state: text(query['state']), error: text(query['error']) },
        transaction,
      );
      back('conectado=1');
    } catch (error) {
      const code = error instanceof AppException ? error.code : 'FEED_FAILED';
      if (!(error instanceof AppException)) this.logger.error(error);
      back(`error=${encodeURIComponent(code)}`);
    }
  }

  @Patch(':provider')
  @HttpCode(204)
  async setAccount(
    @CurrentUser() user: AuthUser,
    @Param('provider') slug: string,
    @Body() body: UpdateFeedDto,
  ): Promise<void> {
    await this.feeds.setAccount(user.id, slug, body.accountId);
  }

  @Get(':provider/reserves')
  @ZodSerializerDto([ReserveDto])
  reserves(@CurrentUser() user: AuthUser, @Param('provider') slug: string): Promise<FeedReserve[]> {
    return this.feeds.reserves(user.id, slug);
  }

  @Put(':provider/reserves/:id')
  @HttpCode(204)
  async assignReserve(
    @CurrentUser() user: AuthUser,
    @Param() params: ProviderIdParamDto,
    @Body() body: AssignReserveDto,
  ): Promise<void> {
    await this.feeds.assignReserve(user.id, params.provider, params.id, body.pocketId);
  }

  @Get(':provider/held')
  @ZodSerializerDto([HeldDto])
  held(@CurrentUser() user: AuthUser, @Param('provider') slug: string): Promise<HeldMovement[]> {
    return this.feeds.held(user.id, slug);
  }

  @Post(':provider/held/retry')
  @HttpCode(200)
  @ZodSerializerDto(RetryDto)
  retryHeld(
    @CurrentUser() user: AuthUser,
    @Param('provider') slug: string,
  ): Promise<RetryHeldResponse> {
    return this.feeds.retryHeld(user.id, slug);
  }

  @Delete(':provider/held/:id')
  @HttpCode(204)
  async dismissHeld(
    @CurrentUser() user: AuthUser,
    @Param() params: ProviderIdParamDto,
  ): Promise<void> {
    await this.feeds.dismissHeld(user.id, params.provider, params.id);
  }

  @Get(':provider/usage')
  @ZodSerializerDto(UsageDto)
  usage(@CurrentUser() user: AuthUser, @Param('provider') slug: string): Promise<FeedUsage> {
    return this.feeds.usageOf(user.id, slug);
  }

  @Delete(':provider')
  @HttpCode(204)
  async disconnect(@CurrentUser() user: AuthUser, @Param('provider') slug: string): Promise<void> {
    await this.feeds.disconnect(user.id, slug);
  }

  private txCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: FEED_TX_COOKIE_PATH,
    };
  }
}

/**
 * The institution's notices: no JWT, outside ORIGIN_SECRET (configured straight to Render) and
 * protected by the institution's signature. A notice is never trusted as data: the movement is
 * read from the API with the connection's own token.
 */
@Controller('feeds')
export class FeedWebhookController {
  private readonly logger = new Logger(FeedWebhookController.name);

  constructor(
    private readonly registry: FeedProviderRegistry,
    private readonly ingest: FeedIngestService,
    private readonly cipher: FeedTokenCipher,
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post(':provider/webhook')
  @HttpCode(200)
  async webhook(
    @Param('provider') slug: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const provider = this.registry.bySlug(slug);
    const notice = provider.verifyWebhook({ headers, query, body, now: this.clock.now() });
    if (!notice) {
      this.trace(body, 'invalid signature');
      throw new AppException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED, 'Invalid signature');
    }
    const outcome = await this.handle(provider, notice);
    this.trace(body, outcome);
    return { ok: true };
  }

  /** What the notice turned into, for the log (never amounts nor names). */
  private async handle(provider: AccountFeedProvider, notice: FeedNotice): Promise<string> {
    if (notice.kind === 'IGNORED') {
      await this.ingest.recordEvent(notice.requestId);
      return 'ignored topic';
    }
    const connection = await this.prisma.feedConnection.findUnique({
      where: {
        provider_externalUserId: {
          provider: provider.provider,
          externalUserId: notice.externalUserId,
        },
      },
    });
    if (notice.kind === 'DEAUTHORIZED') {
      if (connection) await this.ingest.needsReconnect(connection.id);
      await this.ingest.recordEvent(notice.requestId);
      return connection ? 'deauthorized' : 'deauthorized, not connected';
    }
    if (!connection || connection.status !== 'ACTIVE' || !connection.accessTokenEnc) {
      await this.ingest.recordEvent(notice.requestId);
      return connection ? `connection ${connection.status}` : 'not connected';
    }
    const seen = await this.prisma.feedWebhookEvent.findUnique({
      where: { requestId: notice.requestId },
    });
    if (seen) return 'repeated';
    let movements;
    try {
      movements = await provider.getMovement(
        this.cipher.decrypt(connection.accessTokenEnc),
        notice.resourceId,
        connection.externalUserId,
      );
    } catch (error) {
      if (error instanceof FeedAuthError) {
        await this.ingest.needsReconnect(connection.id);
        await this.ingest.recordEvent(notice.requestId);
        return 'token rejected';
      }
      // The institution did not answer: a 500 makes it retry, and the sync covers the rest.
      this.logger.warn(`Feed notice ${notice.requestId} failed: ${(error as Error).name}`);
      throw error;
    }
    if (movements.length === 0) {
      await this.ingest.recordEvent(notice.requestId);
      return 'not a finished movement';
    }
    const outcomes = await this.ingest.ingest(connection.id, movements, notice.requestId);
    return movements.map((m, i) => `${m.kind} ${outcomes[i]}`).join(', ');
  }

  /**
   * Phase 40 in production: one line per notice with its topic, action, delay and outcome, to
   * learn what Mercado Pago sends for each kind of movement. Never amounts, names or ids of people.
   */
  private trace(body: unknown, outcome: string): void {
    const notice = (body ?? {}) as { type?: unknown; action?: unknown; date_created?: unknown };
    const created = typeof notice.date_created === 'string' ? Date.parse(notice.date_created) : NaN;
    const delay = Number.isNaN(created) ? '?' : `${Math.round((Date.now() - created) / 1000)}s`;
    this.logger.log(
      `Feed notice type=${String(notice.type)} action=${String(notice.action)} delay=${delay}: ${outcome}`,
    );
  }
}

/** The actions of a movement's detail (MPG-06, 08). */
@Controller()
export class FeedMovementsController {
  constructor(private readonly feeds: FeedsService) {}

  @Post('transactions/:id/convert')
  @HttpCode(200)
  @ZodSerializerDto(ConvertResponseDto)
  convert(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: ConvertDto,
  ): Promise<ConvertTransactionResponse> {
    return this.feeds.convert(user.id, params.id, body);
  }

  @Post('external-movements/:id/unlink')
  @HttpCode(200)
  @ZodSerializerDto(UnlinkResponseDto)
  unlink(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
  ): Promise<UnlinkExternalMovementResponse> {
    return this.feeds.unlink(user.id, params.id);
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** The signed feed_tx cookie, or undefined when missing, tampered with or malformed. */
function readTransaction(req: Request): FeedTransaction | undefined {
  const signed = req.signedCookies as Record<string, unknown> | undefined;
  const raw = signed?.[FEED_TX_COOKIE];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = feedTransactionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
