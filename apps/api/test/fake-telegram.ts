import type { SendOptions } from '../src/telegram/telegram-client';
import { TelegramClient } from '../src/telegram/telegram-client';

export interface SentMessage {
  chatId: bigint;
  text: string;
  buttons: { text: string; data: string }[];
  messageId: number;
  edited: boolean;
}

/** Records what the bot would send to Telegram. */
export class FakeTelegramClient extends TelegramClient {
  messages: SentMessage[] = [];
  answers: { id: string; text?: string }[] = [];
  private nextId = 100;

  reset(): void {
    this.messages = [];
    this.answers = [];
  }

  async sendMessage(chatId: bigint, text: string, options: SendOptions = {}) {
    const messageId = ++this.nextId;
    this.messages.push({ chatId, text, buttons: flatten(options), messageId, edited: false });
    return messageId;
  }

  async editMessageText(
    chatId: bigint,
    messageId: number,
    text: string,
    options: SendOptions = {},
  ) {
    this.messages.push({ chatId, text, buttons: flatten(options), messageId, edited: true });
  }

  async answerCallbackQuery(id: string, text?: string) {
    this.answers.push({ id, text });
  }

  /** The last message (sent or edited) in a chat. */
  last(chatId: number): SentMessage {
    const found = [...this.messages].reverse().find((m) => m.chatId === BigInt(chatId));
    if (!found) throw new Error(`No message in chat ${chatId}`);
    return found;
  }

  /** The callback data of the button whose text starts with `label`, in the last messages. */
  button(chatId: number, label: string): string {
    for (const message of [...this.messages].reverse()) {
      if (message.chatId !== BigInt(chatId)) continue;
      const found = message.buttons.find((b) => b.text.startsWith(label));
      if (found) return found.data;
    }
    throw new Error(`No button "${label}" in chat ${chatId}`);
  }
}

function flatten(options: SendOptions) {
  return (options.keyboard ?? []).flat().map((b) => ({ text: b.text, data: b.callback_data }));
}
