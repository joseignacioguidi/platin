import { Injectable } from '@nestjs/common';
import type { TelegramLinkCode, TelegramStatus } from '@platin/contracts';
import { createHash, randomInt } from 'node:crypto';
import { AppException } from '../common/app-exception';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { BotTurn, say } from './bot-context';
import { BOT_TEXTS as T } from './bot.texts';

/** BOT-01: single use, 10 minutes. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export interface TelegramSender {
  id: number;
  first_name?: string;
}

/** BOT-01: link and unlink a Telegram account. The userId never travels through Telegram. */
@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return !!this.config.env.TELEGRAM_BOT_TOKEN;
  }

  async status(userId: string): Promise<TelegramStatus> {
    if (!this.enabled) return { enabled: false, botUsername: null, link: null };
    const link = await this.prisma.telegramLink.findUnique({ where: { userId } });
    return {
      enabled: true,
      botUsername: this.config.env.TELEGRAM_BOT_USERNAME ?? null,
      link: link ? { firstName: link.firstName, linkedAt: link.linkedAt.toISOString() } : null,
    };
  }

  /** A new code replaces the unused ones of the user. Only its hash is stored. */
  async createCode(userId: string): Promise<TelegramLinkCode> {
    this.assertEnabled();
    const code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.telegramLinkCode.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.telegramLinkCode.create({
        data: { userId, codeHash: this.hash(code), expiresAt },
      }),
    ]);
    const username = this.config.env.TELEGRAM_BOT_USERNAME;
    return {
      code,
      url: `https://t.me/${username}?start=${code}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async unlink(userId: string): Promise<void> {
    this.assertEnabled();
    await this.prisma.telegramLink.deleteMany({ where: { userId } });
  }

  /** "/start <code>" or "/vincular <code>". */
  async linkFromChat(turn: BotTurn, from: TelegramSender, rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    const row = code
      ? await turn.tx.telegramLinkCode.findUnique({ where: { codeHash: this.hash(code) } })
      : null;
    if (!row || row.usedAt || row.expiresAt < turn.now) {
      say(turn, T.badCode);
      return;
    }
    const user = await turn.tx.user.findUnique({ where: { id: row.userId } });
    if (!user) {
      say(turn, T.badCode);
      return;
    }
    if (user.status === 'SUSPENDED') {
      say(turn, T.suspended);
      return;
    }
    await turn.tx.telegramLinkCode.update({ where: { id: row.id }, data: { usedAt: turn.now } });
    const telegramUserId = BigInt(from.id);
    // One Telegram account per platin account and vice versa: linking again replaces.
    const previous = await turn.tx.telegramLink.findUnique({ where: { telegramUserId } });
    if (previous && previous.userId !== user.id) {
      await turn.tx.telegramLink.delete({ where: { userId: previous.userId } });
    }
    const data = {
      telegramUserId,
      chatId: turn.chatId,
      firstName: from.first_name?.slice(0, 64) ?? null,
      linkedAt: turn.now,
      lastSeenAt: turn.now,
    };
    await turn.tx.telegramLink.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    const name = (user.name ?? from.first_name ?? '').replace(/\*/g, '').trim();
    say(turn, T.welcome(name || 'hola'));
    if (previous && previous.userId !== user.id) say(turn, T.replaced);
  }

  private hash(code: string): string {
    return createHash('sha256')
      .update(`${this.config.env.TELEGRAM_CODE_PEPPER ?? ''}:${code}`)
      .digest('hex');
  }

  private assertEnabled(): void {
    if (!this.enabled) throw AppException.notFound('The Telegram bot is not configured');
  }
}
