import { Injectable } from '@nestjs/common';
import { TEXT_ENTRY_MESSAGES, textEntryDraftSchema, AMBIGUOUS_DATE_TEXTS } from '@platin/contracts';
import {
  addDays,
  dateParts,
  formatMoney,
  isCardCurrency,
  Money,
  normalizeText,
  parseLocalDate,
  type TextEntryDraft,
} from '@platin/domain';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import type { BotDraft, Prisma } from '../generated/prisma/client';
import { ChargesService } from '../cards/charges.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { MerchantRulesService } from '../text-entry/merchant-rules.service';
import { TextEntryService } from '../text-entry/text-entry.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BotTurn, say, show } from './bot-context';
import { BOT_TEXTS as T } from './bot.texts';
import { dataErrorMessage } from './bot-messages';
import type { Keyboard } from './telegram-client';

/** BOT-02: a draft lives 2 hours. */
export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CATEGORY_CHOICES = 8;
/** Before there is history, the most common suggested categories go first (as in the web). */
const POPULAR = [
  'Supermercado',
  'Delivery',
  'Salidas',
  'Nafta',
  'Farmacia',
  'Transporte',
  'Sueldo',
  'Freelance',
  'Ventas',
];

interface DraftOptions {
  /** AMBIGUOUS_DATE: the past and the coming one. */
  dates?: [TextEntryDraft, TextEntryDraft];
  /** The categories or sources offered by the last "Cambiar…" (callback `pick:<id>:<i>`). */
  choices?: { kind: 'CATEGORY' | 'SOURCE'; values: string[] };
}

const money = (amount: string, currency: TextEntryDraft['currency']) =>
  formatMoney(Money.of(amount, currency), { decimals: 'auto' });
const dayMonth = (date: string) => {
  const { day, month } = dateParts(parseLocalDate(date));
  return `${day}/${month}`;
};
/** User words inside a message must not break the bold marks. */
const clean = (text: string) => text.replace(/\*/g, '');

/** BOT-02 to BOT-04: what the bot understood, its buttons and the confirmation. */
@Injectable()
export class BotDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly textEntry: TextEntryService,
    private readonly transactions: TransactionsService,
    private readonly charges: ChargesService,
    private readonly rules: MerchantRulesService,
    private readonly dashboard: DashboardService,
  ) {}

  /** A message that is not a command: the parser, then a draft or the error. */
  async fromText(turn: BotTurn, userId: string, text: string): Promise<void> {
    const result = await this.textEntry.interpret(userId, text);
    if (!result.ok && result.error === 'AMBIGUOUS_DATE' && 'options' in result) {
      const [past, future] = result.options;
      const draft = await this.create(turn, userId, text, past, { dates: [past, future] });
      say(
        turn,
        AMBIGUOUS_DATE_TEXTS.question(dateParts(parseLocalDate(future.date)).day),
        [
          [
            {
              text: AMBIGUOUS_DATE_TEXTS.past(dayMonth(past.date)),
              callback_data: `d0:${draft.id}`,
            },
            {
              text: AMBIGUOUS_DATE_TEXTS.future(dayMonth(future.date)),
              callback_data: `d1:${draft.id}`,
            },
          ],
        ],
        draft.id,
      );
      return;
    }
    if (!result.ok) {
      if (typeof result.error === 'string' && result.error in TEXT_ENTRY_MESSAGES) {
        // BOT-06: what the parser did not understand is kept 90 days.
        await turn.tx.unparsedMessage.create({
          data: { userId, text: text.slice(0, 500), error: result.error, channel: 'TELEGRAM' },
        });
        say(turn, TEXT_ENTRY_MESSAGES[result.error as keyof typeof TEXT_ENTRY_MESSAGES]);
      } else {
        say(turn, dataErrorMessage(result as Parameters<typeof dataErrorMessage>[0]));
      }
      return;
    }
    const resolved = await this.withDefaultSource(userId, result.draft);
    if (!resolved) {
      say(turn, T.noAccount);
      return;
    }
    const draft = await this.create(turn, userId, text, resolved, {});
    await this.render(turn, draft.id, null, resolved);
  }

  /** The text that answers "Otra": the name of a category, existing or new. */
  async onCategoryName(turn: BotTurn, userId: string, row: BotDraft, text: string): Promise<void> {
    const draft = this.read(row);
    const name = text.trim().slice(0, 40);
    const wanted = normalizeText(name);
    const categories = await turn.tx.category.findMany({
      where: { userId, kind: draft.type, archivedAt: null, systemKey: null },
    });
    const exact = categories.find((c) => normalizeText(c.name) === wanted);
    const prefixed = categories.filter((c) => normalizeText(c.name).startsWith(wanted));
    const category =
      exact ??
      (prefixed.length === 1 ? prefixed[0] : null) ??
      (await turn.tx.category.create({
        data: { userId, name, kind: draft.type, icon: 'tag', color: 'muted' },
      }));
    await this.setCategory(turn, row, draft, category.id, category.name);
  }

  /** The buttons: `<action>:<draftId>[:<index>]`. */
  async onButton(
    turn: BotTurn,
    userId: string,
    action: string,
    draftId: string,
    index: number | null,
    callbackId: string,
  ): Promise<void> {
    const row = await turn.tx.botDraft.findFirst({
      where: { id: draftId, chatId: turn.chatId, userId },
    });
    if (!row || row.status === 'CANCELLED' || (row.status === 'OPEN' && row.expiresAt < turn.now)) {
      turn.replies.push({ kind: 'answer', callbackId, text: T.expired });
      return;
    }
    // A second "Confirmar" (or any late button) never creates another movement.
    if (row.status === 'CONFIRMED' && action !== 'rule' && action !== 'norule') {
      turn.replies.push({ kind: 'answer', callbackId, text: T.alreadySaved });
      return;
    }
    turn.replies.push({ kind: 'answer', callbackId });
    const draft = this.read(row);
    const options = (row.options ?? {}) as DraftOptions;

    switch (action) {
      case 'ok':
        return this.confirm(turn, userId, row, draft, callbackId);
      case 'no':
        await turn.tx.botDraft.update({ where: { id: row.id }, data: { status: 'CANCELLED' } });
        show(turn, row.messageId, T.cancelled);
        return;
      case 'd0':
      case 'd1': {
        const chosen = options.dates?.[action === 'd0' ? 0 : 1];
        if (!chosen) return;
        const resolved = (await this.withDefaultSource(userId, chosen)) ?? chosen;
        await this.save(turn, row.id, resolved, {});
        await this.render(turn, row.id, row.messageId, resolved);
        return;
      }
      case 'cat':
        return this.offerCategories(turn, userId, row, draft);
      case 'acc':
        return this.offerSources(turn, userId, row, draft);
      case 'other':
        await turn.tx.botDraft.update({
          where: { id: row.id },
          data: { awaiting: 'CATEGORY_NAME' },
        });
        say(turn, T.writeCategory);
        return;
      case 'pick': {
        const choice = index === null ? undefined : options.choices?.values[index];
        if (!choice || !options.choices) return;
        if (options.choices.kind === 'CATEGORY') {
          const category = await turn.tx.category.findFirst({ where: { id: choice, userId } });
          if (category) await this.setCategory(turn, row, draft, category.id, category.name);
        } else {
          const [kind, id] = choice.split(':');
          const next: TextEntryDraft = {
            ...draft,
            source: { kind: kind === 'C' ? 'CARD' : 'ACCOUNT', id },
            installments: kind === 'C' ? draft.installments : 1,
          };
          await this.save(turn, row.id, next, {});
          await this.render(turn, row.id, row.messageId, next);
        }
        return;
      }
      case 'rule':
      case 'norule': {
        const pattern = firstWord(draft.description);
        if (action === 'norule' || !pattern || !draft.categoryId) {
          say(turn, T.ruleSkipped);
          return;
        }
        await this.rules.upsertIn(turn.tx, userId, pattern, draft.categoryId, 'TELEGRAM');
        const category = await turn.tx.category.findFirst({ where: { id: draft.categoryId } });
        say(turn, T.ruleSaved(pattern, clean(category?.name ?? '')));
        return;
      }
    }
  }

  /** The open draft of this chat waiting for a category name, if any. */
  awaitingName(tx: Prisma.TransactionClient, userId: string, chatId: bigint, now: Date) {
    return tx.botDraft.findFirst({
      where: { userId, chatId, status: 'OPEN', awaiting: 'CATEGORY_NAME', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async confirm(
    turn: BotTurn,
    userId: string,
    row: BotDraft,
    draft: TextEntryDraft,
    callbackId: string,
  ): Promise<void> {
    if (!draft.categoryId) {
      turn.replies.push({ kind: 'answer', callbackId, text: T.noCategory });
      return;
    }
    const checked = await this.textEntry.check(userId, draft);
    if (!checked.ok) {
      say(turn, dataErrorMessage(checked));
      return;
    }
    const category = await turn.tx.category.findFirst({ where: { id: draft.categoryId, userId } });
    // MOV-09: without a reason the movement takes the category's name.
    const description = draft.description || category?.name || '—';
    let result: { type: 'TRANSACTION' | 'CHARGE'; id: string };
    try {
      if (draft.source?.kind === 'CARD') {
        const id = await this.charges.createIn(
          turn.tx,
          userId,
          draft.source.id,
          {
            description,
            categoryId: draft.categoryId,
            totalAmount: draft.amount,
            currency: draft.currency as 'ARS' | 'USD',
            date: draft.date,
            installmentsCount: draft.installments,
          },
          'TELEGRAM',
        );
        result = { type: 'CHARGE', id };
      } else {
        const id = await this.transactions.createIn(
          turn.tx,
          userId,
          {
            type: draft.type,
            pocketId: checked.pocketId as string,
            categoryId: draft.categoryId,
            amount: draft.amount,
            date: draft.date,
            description,
          },
          'TELEGRAM',
        );
        result = { type: 'TRANSACTION', id };
      }
    } catch (error) {
      // Business checks run before any write, so the update's transaction is still usable.
      if (error instanceof AppException) {
        say(turn, saveErrorMessage(error.code));
        return;
      }
      throw error;
    }
    await turn.tx.botDraft.update({
      where: { id: row.id },
      data: { status: 'CONFIRMED', resultType: result.type, resultId: result.id, awaiting: null },
    });
    const summary = await this.summary(turn.tx, userId, draft);
    show(turn, row.messageId, summary);
    turn.replies.push({
      kind: 'later',
      build: async () => [
        { kind: 'send', chatId: turn.chatId, text: T.saved(await this.free(userId)) },
      ],
    });
  }

  /** "$ 106.062", the free amount of the month (after the commit). */
  async free(userId: string): Promise<string | null> {
    const dashboard = await this.dashboard.get(userId);
    return formatMoney(Money.of(dashboard.free, dashboard.currency), { decimals: 'auto' });
  }

  private async setCategory(
    turn: BotTurn,
    row: BotDraft,
    draft: TextEntryDraft,
    categoryId: string,
    categoryName: string,
  ): Promise<void> {
    const next = { ...draft, categoryId };
    await this.save(turn, row.id, next, {});
    await this.render(turn, row.id, row.messageId, next);
    // BOT-03: learn the merchant from the first word of the reason.
    const pattern = firstWord(draft.description);
    if (pattern) {
      say(turn, T.ruleOffer(clean(pattern), clean(categoryName)), [
        [
          { text: T.buttons.yes, callback_data: `rule:${row.id}` },
          { text: T.buttons.no, callback_data: `norule:${row.id}` },
        ],
      ]);
    }
  }

  private async offerCategories(
    turn: BotTurn,
    userId: string,
    row: BotDraft,
    draft: TextEntryDraft,
  ) {
    const [categories, recent] = await Promise.all([
      turn.tx.category.findMany({
        where: { userId, kind: draft.type, archivedAt: null, systemKey: null },
        orderBy: { name: 'asc' },
      }),
      this.recentCategoryIds(turn.tx, userId),
    ]);
    const rank = (category: { id: string; name: string }) => {
      if (recent.includes(category.id)) return recent.indexOf(category.id);
      const popular = POPULAR.indexOf(category.name);
      return recent.length + (popular === -1 ? POPULAR.length : popular);
    };
    const chosen = [...categories].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_CATEGORY_CHOICES);
    await this.save(turn, row.id, draft, {
      choices: { kind: 'CATEGORY', values: chosen.map((c) => c.id) },
    });
    const keyboard: Keyboard = pairs(
      chosen.map((c, i) => ({ text: c.name, callback_data: `pick:${row.id}:${i}` })),
    );
    keyboard.push([
      { text: T.buttons.other, callback_data: `other:${row.id}` },
      { text: T.buttons.cancel, callback_data: `no:${row.id}` },
    ]);
    show(turn, row.messageId, T.chooseCategory, keyboard);
  }

  private async offerSources(turn: BotTurn, userId: string, row: BotDraft, draft: TextEntryDraft) {
    const [accounts, cards] = await Promise.all([
      turn.tx.account.findMany({
        where: {
          userId,
          archivedAt: null,
          pockets: { some: { kind: 'AVAILABLE', currency: draft.currency, archivedAt: null } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      draft.type === 'EXPENSE' && isCardCurrency(draft.currency) && !draft.scheduled
        ? turn.tx.creditCard.findMany({
            where: { userId, archivedAt: null },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);
    const values = [...accounts.map((a) => `A:${a.id}`), ...cards.map((c) => `C:${c.id}`)].slice(
      0,
      12,
    );
    const names = [...accounts.map((a) => a.name), ...cards.map((c) => c.name)];
    await this.save(turn, row.id, draft, { choices: { kind: 'SOURCE', values } });
    const keyboard = pairs(
      values.map((_, i) => ({ text: names[i], callback_data: `pick:${row.id}:${i}` })),
    );
    keyboard.push([{ text: T.buttons.cancel, callback_data: `no:${row.id}` }]);
    show(turn, row.messageId, T.chooseSource, keyboard);
  }

  private async create(
    turn: BotTurn,
    userId: string,
    text: string,
    draft: TextEntryDraft,
    options: DraftOptions,
  ): Promise<BotDraft> {
    return turn.tx.botDraft.create({
      data: {
        userId,
        chatId: turn.chatId,
        text: text.slice(0, 500),
        draft: draft as unknown as Prisma.InputJsonValue,
        options: options as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(turn.now.getTime() + DRAFT_TTL_MS),
      },
    });
  }

  private async save(turn: BotTurn, id: string, draft: TextEntryDraft, options: DraftOptions) {
    await turn.tx.botDraft.update({
      where: { id },
      data: {
        draft: draft as unknown as Prisma.InputJsonValue,
        options: options as unknown as Prisma.InputJsonValue,
        awaiting: null,
      },
    });
  }

  /** The summary with its buttons; "Confirmar" only once there is a category. */
  private async render(
    turn: BotTurn,
    id: string,
    messageId: number | null,
    draft: TextEntryDraft,
  ): Promise<void> {
    const summary = await this.summary(turn.tx, null, draft);
    const keyboard: Keyboard = [];
    if (draft.categoryId) keyboard.push([{ text: T.buttons.confirm, callback_data: `ok:${id}` }]);
    keyboard.push([
      { text: T.buttons.category, callback_data: `cat:${id}` },
      { text: T.buttons.source, callback_data: `acc:${id}` },
    ]);
    keyboard.push([{ text: T.buttons.cancel, callback_data: `no:${id}` }]);
    const text = draft.categoryId ? summary : `${summary}\n${T.noCategory}`;
    show(turn, messageId, text, keyboard, id);
  }

  /** "Gasto · $ 45.000 · Supermercado · Visa Santander · 3 cuotas de $ 15.000 · hoy". */
  private async summary(
    tx: Prisma.TransactionClient,
    _userId: string | null,
    draft: TextEntryDraft,
  ): Promise<string> {
    const [category, source] = await Promise.all([
      draft.categoryId ? tx.category.findUnique({ where: { id: draft.categoryId } }) : null,
      draft.source?.kind === 'CARD'
        ? tx.creditCard.findUnique({ where: { id: draft.source.id } })
        : draft.source
          ? tx.account.findUnique({ where: { id: draft.source.id } })
          : null,
    ]);
    const today = this.clock.today();
    const date = draft.scheduled
      ? T.scheduled(dayMonth(draft.date))
      : draft.date === today
        ? T.today
        : draft.date === addDays(today, -1)
          ? T.yesterday
          : dayMonth(draft.date);
    const parts = [T.types[draft.type], money(draft.amount, draft.currency)];
    if (category) parts.push(clean(category.name));
    if (source) parts.push(clean(source.name));
    if (draft.installments > 1) {
      const each = Money.of(draft.amount, draft.currency).split(draft.installments)[0];
      parts.push(T.installments(draft.installments, formatMoney(each, { decimals: 'auto' })));
    }
    parts.push(date);
    return parts.join(' · ');
  }

  /** Without an alias or a usable last source: the first account with a balance in the currency. */
  private async withDefaultSource(
    userId: string,
    draft: TextEntryDraft,
  ): Promise<TextEntryDraft | null> {
    if (draft.source) return draft;
    const account = await this.prisma.account.findFirst({
      where: {
        userId,
        archivedAt: null,
        pockets: { some: { kind: 'AVAILABLE', currency: draft.currency, archivedAt: null } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const fallback =
      account ??
      (await this.prisma.account.findFirst({
        where: { userId, archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }));
    return fallback ? { ...draft, source: { kind: 'ACCOUNT', id: fallback.id } } : null;
  }

  private async recentCategoryIds(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
    const [transactions, charges] = await Promise.all([
      tx.transaction.findMany({
        where: { userId, categoryId: { not: null }, origin: { in: ['MANUAL', 'SCHEDULED'] } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { categoryId: true, createdAt: true },
      }),
      tx.cardCharge.findMany({
        where: { userId, fixedId: null },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { categoryId: true, createdAt: true },
      }),
    ]);
    return [
      ...new Set(
        [...transactions, ...charges]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((row) => row.categoryId as string),
      ),
    ];
  }

  private read(row: BotDraft): TextEntryDraft {
    const parsed = textEntryDraftSchema.parse(row.draft);
    return { ...parsed, date: parseLocalDate(parsed.date) } as TextEntryDraft;
  }
}

/** The first word of the reason, normalized: the pattern of the rule BOT-03 offers. */
export function firstWord(description: string): string | null {
  const word = normalizeText(description).split(' ')[0];
  return word && word.length >= 2 ? word : null;
}

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

function saveErrorMessage(code: string): string {
  switch (code) {
    case 'CURRENCY_NOT_ENABLED':
      return 'Esa moneda no está activada. Activala en platin › Perfil › Monedas.';
    case 'EXCHANGE_RATE_REQUIRED':
      return 'Todavía no tengo la cotización de esa moneda. Cargalo desde la app.';
    case 'CARD_ARCHIVED':
    case 'NOT_FOUND':
      return 'Esa cuenta o tarjeta ya no existe. Elegí otra.';
    default:
      return 'No pude guardarlo. Probá desde la app.';
  }
}
