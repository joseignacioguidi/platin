import type { Prisma } from '../generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPDATES_KEPT_DAYS = 3;
const UNPARSED_KEPT_DAYS = 90;

/**
 * No cron (ADR 0026): expired drafts and link codes, updates older than 3 days and unparsed
 * messages older than 90 go away when an update arrives and on POST /sync.
 */
export async function cleanupTelegram(
  client: Pick<
    Prisma.TransactionClient,
    'botDraft' | 'telegramUpdate' | 'unparsedMessage' | 'telegramLinkCode'
  >,
  now: Date,
): Promise<void> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  await client.botDraft.deleteMany({ where: { expiresAt: { lt: now } } });
  await client.telegramLinkCode.deleteMany({ where: { expiresAt: { lt: now } } });
  await client.telegramUpdate.deleteMany({ where: { receivedAt: { lt: ago(UPDATES_KEPT_DAYS) } } });
  await client.unparsedMessage.deleteMany({
    where: { createdAt: { lt: ago(UNPARSED_KEPT_DAYS) } },
  });
}
