import { z } from 'zod';
import { uuidSchema } from './common';

/** GET /telegram/link (BOT-01). Without the bot configured, `enabled` is false. */
export const telegramStatusSchema = z.object({
  enabled: z.boolean(),
  botUsername: z.string().nullable(),
  link: z.object({ firstName: z.string().nullable(), linkedAt: z.string() }).nullable(),
});

/** POST /telegram/link-code: the t.me link and the same code for /vincular. */
export const telegramLinkCodeSchema = z.object({
  code: z.string(),
  url: z.string(),
  expiresAt: z.string(),
});

/** BOT-06: what the parser did not understand, kept 90 days. */
export const unparsedMessageSchema = z.object({
  id: uuidSchema,
  text: z.string(),
  error: z.string(),
  createdAt: z.string(),
});

export type TelegramStatus = z.infer<typeof telegramStatusSchema>;
export type TelegramLinkCode = z.infer<typeof telegramLinkCodeSchema>;
export type UnparsedMessage = z.infer<typeof unparsedMessageSchema>;
