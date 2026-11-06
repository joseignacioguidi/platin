import { Injectable } from '@nestjs/common';
import type { TextEntryContextResponse } from '@platin/contracts';
import {
  checkTextEntryDraft,
  parseTextEntry,
  type Currency,
  type TextEntryContext,
  type TextEntryDataError,
  type TextEntryDraft,
  type TextEntryResult,
  type TextEntrySource,
} from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** The parser result after the data checks, as the bot uses it. */
export type InterpretResult =
  | Exclude<TextEntryResult, { ok: true }>
  | ({ ok: false } & TextEntryDataError)
  | { ok: true; draft: TextEntryDraft; pocketId: string | null };

/** TXT-01: what the parser needs, and the data checks after it (CURRENCY_NOT_ENABLED...). */
@Injectable()
export class TextEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  /** GET /text-entry/context: aliases of active accounts and cards, rules and the last source. */
  async context(userId: string): Promise<TextEntryContextResponse> {
    const [aliases, rules, global, lastUsed] = await Promise.all([
      this.prisma.sourceAlias.findMany({
        where: {
          userId,
          OR: [{ account: { archivedAt: null } }, { card: { archivedAt: null } }],
        },
        orderBy: { alias: 'asc' },
      }),
      this.prisma.merchantRule.findMany({
        where: { userId, category: { archivedAt: null } },
        orderBy: { pattern: 'asc' },
      }),
      this.settings.value('merchant-rules'),
      this.lastUsed(userId),
    ]);
    return {
      aliases: aliases.map((row) => ({
        alias: row.alias,
        source: row.accountId
          ? { kind: 'ACCOUNT' as const, id: row.accountId }
          : { kind: 'CARD' as const, id: row.cardId as string },
      })),
      rules: rules.map((row) => ({ pattern: row.pattern, categoryId: row.categoryId })),
      globalRules: global.rules,
      lastUsed,
    };
  }

  /** The parser with the user's data, then the checks that depend on it. */
  async interpret(userId: string, text: string): Promise<InterpretResult> {
    const [context, categories] = await Promise.all([
      this.context(userId),
      this.prisma.category.findMany({
        where: { userId, archivedAt: null, systemKey: null },
        select: { id: true, name: true, kind: true },
      }),
    ]);
    const full: TextEntryContext = { ...context, today: this.clock.today(), categories };
    const result = parseTextEntry(text, full);
    if (!result.ok) return result;
    return this.check(userId, result.draft);
  }

  /** CURRENCY_NOT_ENABLED, NO_BALANCE_IN_CURRENCY and a source that no longer exists. */
  async check(
    userId: string,
    draft: TextEntryDraft,
  ): Promise<
    | ({ ok: false } & TextEntryDataError)
    | { ok: true; draft: TextEntryDraft; pocketId: string | null }
  > {
    const [user, accounts, cards] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currencies: true } }),
      this.prisma.account.findMany({
        where: { userId, archivedAt: null },
        include: { pockets: { where: { kind: 'AVAILABLE', archivedAt: null } } },
      }),
      this.prisma.creditCard.findMany({
        where: { userId, archivedAt: null },
        select: { id: true },
      }),
    ]);
    const checked = checkTextEntryDraft(draft, {
      enabledCurrencies: user.currencies as Currency[],
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        balances: account.pockets.map((pocket) => ({
          pocketId: pocket.id,
          currency: pocket.currency,
        })),
      })),
      cardIds: cards.map((card) => card.id),
    });
    return checked.ok ? { ok: true, draft, pocketId: checked.pocketId } : checked;
  }

  /** The account or card of the latest income, expense or card purchase the person entered. */
  async lastUsed(userId: string): Promise<TextEntrySource | null> {
    const [transaction, charge] = await Promise.all([
      this.prisma.transaction.findFirst({
        where: {
          userId,
          type: { in: ['INCOME', 'EXPENSE'] },
          origin: { in: ['MANUAL', 'SCHEDULED'] },
          pocket: { kind: 'AVAILABLE', archivedAt: null, account: { archivedAt: null } },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, pocket: { select: { accountId: true } } },
      }),
      this.prisma.cardCharge.findFirst({
        where: { userId, fixedId: null, card: { archivedAt: null } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, cardId: true },
      }),
    ]);
    if (charge && (!transaction || charge.createdAt > transaction.createdAt)) {
      return { kind: 'CARD', id: charge.cardId };
    }
    return transaction ? { kind: 'ACCOUNT', id: transaction.pocket.accountId } : null;
  }
}
