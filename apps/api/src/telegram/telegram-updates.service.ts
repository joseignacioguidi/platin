import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { BotCommandsService } from './bot-commands.service';
import { BotTurn, Reply, say } from './bot-context';
import { BotDraftsService } from './bot-drafts.service';
import { BOT_TEXTS as T, toTelegramHtml } from './bot.texts';
import { cleanupTelegram } from './cleanup';
import { TelegramClient } from './telegram-client';
import { TelegramLinkService } from './telegram-link.service';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_TEXT = 500;

const userSchema = z.object({ id: z.number().int(), first_name: z.string().optional() });
const chatSchema = z.object({ id: z.number().int(), type: z.string() });
/** Only what the bot reads; the rest of the update is ignored. */
export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      from: userSchema.optional(),
      chat: chatSchema,
      text: z.string().optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: userSchema,
      data: z.string().optional(),
      message: z.object({ message_id: z.number().int(), chat: chatSchema }).optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/**
 * The webhook (BOT-02 to 06): idempotent by update_id in the same transaction as what the update
 * changes; the replies go to Telegram after the commit.
 */
@Injectable()
export class TelegramUpdatesService {
  private readonly logger = new Logger('TelegramUpdates');
  /** Updates per chat in the last minute; in memory, there is a single instance. */
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: TelegramClient,
    private readonly link: TelegramLinkService,
    private readonly drafts: BotDraftsService,
    private readonly commands: BotCommandsService,
  ) {}

  async handle(update: TelegramUpdate): Promise<void> {
    const chat = update.message?.chat ?? update.callback_query?.message?.chat;
    const from = update.message?.from ?? update.callback_query?.from;
    const now = new Date();
    const replies: Reply[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        const inserted = await tx.telegramUpdate.createMany({
          data: [{ updateId: BigInt(update.update_id) }],
          skipDuplicates: true,
        });
        if (inserted.count === 0) return; // Already processed: a retry from Telegram.
        await cleanupTelegram(tx, now);
        // The bot only talks in private chats.
        if (!chat || !from || chat.type !== 'private') return;
        const turn: BotTurn = { tx, chatId: BigInt(chat.id), now, replies };
        if (this.limited(chat.id, now)) {
          if (update.message) say(turn, T.tooFast);
          else if (update.callback_query)
            replies.push({ kind: 'answer', callbackId: update.callback_query.id, text: T.tooFast });
          return;
        }
        if (update.message?.text)
          await this.onMessage(turn, from, update.message.text.slice(0, MAX_TEXT));
        else if (update.callback_query) await this.onButton(turn, from.id, update.callback_query);
      },
      { timeout: 20_000 },
    );
    await this.send(replies);
  }

  private async onMessage(turn: BotTurn, from: { id: number; first_name?: string }, text: string) {
    const [command, ...rest] = text.trim().split(/\s+/);
    const name = command.startsWith('/') ? command.slice(1).split('@')[0].toLowerCase() : null;
    const argument = rest.join(' ');
    if ((name === 'start' || name === 'vincular') && argument) {
      return this.link.linkFromChat(turn, from, argument);
    }
    const link = await turn.tx.telegramLink.findUnique({
      where: { telegramUserId: BigInt(from.id) },
      include: { user: { select: { id: true, status: true } } },
    });
    if (!link) {
      say(turn, name === 'vincular' ? T.badCode : T.notLinked);
      return;
    }
    if (link.user.status === 'SUSPENDED') {
      say(turn, T.suspended);
      return;
    }
    const userId = link.userId;
    await turn.tx.telegramLink.update({
      where: { userId },
      data: { lastSeenAt: turn.now, chatId: turn.chatId },
    });

    switch (name) {
      case null:
        break;
      case 'start':
      case 'ayuda':
      case 'help':
        return say(turn, T.help);
      case 'libre':
        return this.commands.free(turn, userId);
      case 'hoy':
        return this.commands.today(turn, userId);
      case 'pendientes':
        return this.commands.pending(turn, userId);
      case 'proximos':
      case 'próximos':
        return this.commands.upcoming(turn, userId);
      case 'deshacer':
        return this.commands.undo(turn, userId);
      case 'desvincular':
        await turn.tx.telegramLink.delete({ where: { userId } });
        return say(turn, T.unlinked);
      default:
        return say(turn, T.help);
    }

    const awaiting = await this.drafts.awaitingName(turn.tx, userId, turn.chatId, turn.now);
    if (awaiting) return this.drafts.onCategoryName(turn, userId, awaiting, text);
    return this.drafts.fromText(turn, userId, text);
  }

  private async onButton(
    turn: BotTurn,
    telegramUserId: number,
    query: NonNullable<TelegramUpdate['callback_query']>,
  ) {
    const link = await turn.tx.telegramLink.findUnique({
      where: { telegramUserId: BigInt(telegramUserId) },
      include: { user: { select: { status: true } } },
    });
    if (!link || link.user.status === 'SUSPENDED') {
      turn.replies.push({
        kind: 'answer',
        callbackId: query.id,
        text: link ? T.suspended : T.notLinked,
      });
      return;
    }
    const [action, first, second] = (query.data ?? '').split(':');
    const uuid = /^[0-9a-f-]{36}$/;
    switch (action) {
      case 'pend':
        if (uuid.test(first))
          return this.commands.confirmPending(turn, link.userId, first, query.id);
        break;
      case 'undo':
        if (uuid.test(second))
          return this.commands.confirmUndo(turn, link.userId, first, second, query.id);
        break;
      case 'keep':
        turn.replies.push({ kind: 'answer', callbackId: query.id });
        return say(turn, T.undoKept);
      default:
        if (uuid.test(first ?? '')) {
          const index = second === undefined ? null : Number(second);
          return this.drafts.onButton(
            turn,
            link.userId,
            action,
            first,
            Number.isInteger(index) ? index : null,
            query.id,
          );
        }
    }
    turn.replies.push({ kind: 'answer', callbackId: query.id, text: T.expired });
  }

  private limited(chatId: number, now: Date): boolean {
    const key = String(chatId);
    const since = now.getTime() - RATE_WINDOW_MS;
    const times = (this.recent.get(key) ?? []).filter((time) => time > since);
    times.push(now.getTime());
    this.recent.set(key, times);
    if (this.recent.size > 10_000) {
      for (const [other, list] of this.recent)
        if (list.every((time) => time <= since)) this.recent.delete(other);
    }
    return times.length > RATE_LIMIT;
  }

  /** After the commit. A failure is logged: the webhook still answers 200. */
  private async send(replies: Reply[]): Promise<void> {
    for (const reply of replies) {
      try {
        if (reply.kind === 'later') {
          await this.send(await reply.build());
        } else if (reply.kind === 'answer') {
          await this.client.answerCallbackQuery(reply.callbackId, reply.text);
        } else if (reply.kind === 'edit') {
          await this.client.editMessageText(
            reply.chatId,
            reply.messageId,
            toTelegramHtml(reply.text),
            {
              keyboard: reply.keyboard,
            },
          );
        } else {
          const messageId = await this.client.sendMessage(
            reply.chatId,
            toTelegramHtml(reply.text),
            {
              keyboard: reply.keyboard,
            },
          );
          if (reply.draftId && messageId !== null) {
            await this.prisma.botDraft.updateMany({
              where: { id: reply.draftId, messageId: null },
              data: { messageId },
            });
          }
        }
      } catch (error) {
        this.logger.warn(`Reply failed: ${(error as Error).message}`);
      }
    }
  }
}
