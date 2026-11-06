import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

export interface InlineButton {
  text: string;
  /** `<action>:<draftId>`; 64 bytes at most. */
  callback_data: string;
}
export type Keyboard = InlineButton[][];

export interface SendOptions {
  keyboard?: Keyboard;
}

/** The few Telegram Bot API calls the bot uses; replaced by a fake in tests. */
export abstract class TelegramClient {
  /** Returns the id of the message sent. */
  abstract sendMessage(chatId: bigint, html: string, options?: SendOptions): Promise<number | null>;
  abstract editMessageText(
    chatId: bigint,
    messageId: number,
    html: string,
    options?: SendOptions,
  ): Promise<void>;
  abstract answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

/** Over fetch, as the architecture asks: no bot library. */
@Injectable()
export class HttpTelegramClient extends TelegramClient {
  private readonly logger = new Logger('TelegramClient');

  constructor(private readonly config: AppConfig) {
    super();
  }

  async sendMessage(chatId: bigint, html: string, options: SendOptions = {}) {
    const result = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId.toString(),
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(options.keyboard ? { reply_markup: { inline_keyboard: options.keyboard } } : {}),
    });
    return result?.message_id ?? null;
  }

  async editMessageText(
    chatId: bigint,
    messageId: number,
    html: string,
    options: SendOptions = {},
  ) {
    await this.call('editMessageText', {
      chat_id: chatId.toString(),
      message_id: messageId,
      text: html,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: options.keyboard ?? [] },
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  private async call<T>(method: string, body: object): Promise<T | null> {
    const token = this.config.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json().catch(() => null)) as {
      ok: boolean;
      result?: T;
      description?: string;
    } | null;
    if (!json?.ok) {
      // Never log the token: only the method and Telegram's description.
      this.logger.warn(`${method} failed: ${json?.description ?? response.status}`);
      return null;
    }
    return json.result ?? null;
  }
}
