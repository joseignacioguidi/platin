import type { Prisma } from '../generated/prisma/client';
import type { Keyboard } from './telegram-client';

/** What the bot answers; sent only after the update's transaction commits. */
export type Reply =
  | {
      kind: 'send';
      chatId: bigint;
      text: string;
      keyboard?: Keyboard;
      /** Store the id of the message sent on this draft (it is edited with each change). */
      draftId?: string;
    }
  | { kind: 'edit'; chatId: bigint; messageId: number; text: string; keyboard?: Keyboard }
  | { kind: 'answer'; callbackId: string; text?: string }
  /** Built after the commit, when it needs data the transaction wrote (the free amount). */
  | { kind: 'later'; build: () => Promise<Reply[]> };

/** One update being processed: its transaction and the replies it collects. */
export interface BotTurn {
  tx: Prisma.TransactionClient;
  chatId: bigint;
  now: Date;
  replies: Reply[];
}

export function say(turn: BotTurn, text: string, keyboard?: Keyboard, draftId?: string): void {
  turn.replies.push({ kind: 'send', chatId: turn.chatId, text, keyboard, draftId });
}

/** Edits the draft's message, or sends a new one when it has none. */
export function show(
  turn: BotTurn,
  messageId: number | null,
  text: string,
  keyboard?: Keyboard,
  draftId?: string,
): void {
  if (messageId === null) say(turn, text, keyboard, draftId);
  else turn.replies.push({ kind: 'edit', chatId: turn.chatId, messageId, text, keyboard });
}
