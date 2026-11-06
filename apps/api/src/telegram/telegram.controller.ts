import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  idParamSchema,
  telegramLinkCodeSchema,
  telegramStatusSchema,
  unparsedMessageSchema,
  type TelegramLinkCode,
  type TelegramStatus,
  type UnparsedMessage,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { timingSafeEqual } from 'node:crypto';
import { AppException } from '../common/app-exception';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramLinkService } from './telegram-link.service';
import { telegramUpdateSchema, TelegramUpdatesService } from './telegram-updates.service';

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

class IdParamDto extends createZodDto(idParamSchema) {}
class StatusDto extends createZodDto(telegramStatusSchema) {}
class LinkCodeDto extends createZodDto(telegramLinkCodeSchema) {}
class UnparsedDto extends createZodDto(unparsedMessageSchema) {}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The webhook: no JWT, outside ORIGIN_SECRET (it goes straight to Render) and protected by the
 * secret_token Telegram sends in every request.
 */
@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly config: AppConfig,
    private readonly updates: TelegramUpdatesService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers(TELEGRAM_SECRET_HEADER) secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const expected = this.config.env.TELEGRAM_WEBHOOK_SECRET;
    if (!this.config.env.TELEGRAM_BOT_TOKEN || !expected) throw AppException.notFound();
    if (!safeEqual(secret ?? '', expected)) {
      throw new AppException('UNAUTHORIZED', HttpStatus.UNAUTHORIZED, 'Invalid secret token');
    }
    const parsed = telegramUpdateSchema.safeParse(body);
    // Something the bot does not read: acknowledge it so Telegram does not retry.
    if (parsed.success) await this.updates.handle(parsed.data);
    return { ok: true };
  }
}

/** BOT-01 and BOT-06 from the profile. */
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly link: TelegramLinkService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('link')
  @ZodSerializerDto(StatusDto)
  status(@CurrentUser() user: AuthUser): Promise<TelegramStatus> {
    return this.link.status(user.id);
  }

  @Post('link-code')
  @ZodSerializerDto(LinkCodeDto)
  createCode(@CurrentUser() user: AuthUser): Promise<TelegramLinkCode> {
    return this.link.createCode(user.id);
  }

  @Delete('link')
  @HttpCode(204)
  async unlink(@CurrentUser() user: AuthUser): Promise<void> {
    await this.link.unlink(user.id);
  }

  @Get('unparsed')
  @ZodSerializerDto([UnparsedDto])
  async unparsed(@CurrentUser() user: AuthUser): Promise<UnparsedMessage[]> {
    const rows = await this.prisma.unparsedMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Delete('unparsed/:id')
  @HttpCode(204)
  async removeUnparsed(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    const { count } = await this.prisma.unparsedMessage.deleteMany({
      where: { id: params.id, userId: user.id },
    });
    if (count === 0) throw AppException.notFound();
  }

  @Delete('unparsed')
  @HttpCode(204)
  async clearUnparsed(@CurrentUser() user: AuthUser): Promise<void> {
    await this.prisma.unparsedMessage.deleteMany({ where: { userId: user.id } });
  }
}
