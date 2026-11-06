import { Injectable } from '@nestjs/common';
import {
  formatMoney,
  isStatementClosed,
  lastDayOf,
  localDateToUtc,
  Money,
  parsePeriod,
  startOfDayIn,
  utcToLocalDate,
  type Currency,
} from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BotTurn, say } from './bot-context';
import { BOT_TEXTS as T } from './bot.texts';

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
const UPCOMING_LIMIT = 5;
const PENDING_LIMIT = 8;

const money = (amount: string, currency: Currency) =>
  formatMoney(Money.of(amount, currency), { decimals: 'auto' });
const dayMonth = (date: string) => {
  const [, month, day] = date.split('-').map(Number);
  return `${day}/${month}`;
};
const clean = (text: string) => text.replace(/\*/g, '');

/**
 * BOT-05: /libre, /hoy, /pendientes, /proximos and /deshacer. Account balances are never shown
 * here: the messages stay stored in Telegram.
 */
@Injectable()
export class BotCommandsService {
  constructor(
    private readonly clock: ClockService,
    private readonly dashboard: DashboardService,
    private readonly transactions: TransactionsService,
  ) {}

  async free(turn: BotTurn, userId: string): Promise<void> {
    const dashboard = await this.dashboard.get(userId);
    const lastDay = dayMonth(lastDayOf(parsePeriod(dashboard.period)));
    say(
      turn,
      T.free(
        money(dashboard.free, dashboard.currency),
        dashboard.perDay ? money(dashboard.perDay, dashboard.currency) : null,
        lastDay,
      ),
    );
  }

  /** What was entered today, with the total spent per currency. */
  async today(turn: BotTurn, userId: string): Promise<void> {
    const since = startOfDayIn(this.clock.today());
    const [transactions, charges] = await Promise.all([
      turn.tx.transaction.findMany({
        where: {
          userId,
          createdAt: { gte: since },
          type: { in: ['INCOME', 'EXPENSE'] },
          origin: { in: ['MANUAL', 'SCHEDULED'] },
        },
        include: { category: true },
        orderBy: { createdAt: 'asc' },
      }),
      turn.tx.cardCharge.findMany({
        where: { userId, createdAt: { gte: since }, fixedId: null },
        include: { category: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (transactions.length + charges.length === 0) {
      say(turn, T.todayEmpty);
      return;
    }
    const totals = new Map<Currency, Money>();
    const add = (amount: string, currency: Currency) =>
      totals.set(
        currency,
        (totals.get(currency) ?? Money.zero(currency)).add(Money.of(amount, currency)),
      );
    const lines = [
      ...transactions.map((row) => {
        const amount = row.amount.toFixed(2);
        if (row.type === 'EXPENSE') add(amount, row.currency);
        const sign = row.type === 'INCOME' ? '+ ' : '';
        return `• ${sign}${money(amount, row.currency)} · ${clean(row.description ?? row.category?.name ?? '')}`;
      }),
      ...charges.map((row) => {
        const amount = row.totalAmount.toFixed(2);
        add(amount, row.currency);
        return `• ${money(amount, row.currency)} · ${clean(row.description)}`;
      }),
    ];
    const total = [...totals.values()]
      .map((sum) => formatMoney(sum, { decimals: 'auto' }))
      .join(' + ');
    say(
      turn,
      [T.todayTitle, ...lines, total ? T.todayTotal(total) : ''].filter(Boolean).join('\n'),
    );
  }

  /** The movements to confirm (date up to today), each with its button. */
  async pending(turn: BotTurn, userId: string): Promise<void> {
    const rows = await turn.tx.transaction.findMany({
      where: { userId, status: 'PENDING', date: { lte: localDateToUtc(this.clock.today()) } },
      include: { category: true },
      orderBy: { date: 'asc' },
      take: PENDING_LIMIT,
    });
    if (rows.length === 0) {
      say(turn, T.pendingEmpty);
      return;
    }
    const label = (row: (typeof rows)[number]) =>
      `${clean(row.description ?? row.category?.name ?? '')} · ${money(row.amount.toFixed(2), row.currency)}`;
    say(
      turn,
      [
        T.pendingTitle,
        ...rows.map((row) => `• ${dayMonth(utcToLocalDate(row.date))} · ${label(row)}`),
      ].join('\n'),
      rows.map((row) => [
        {
          text: `${T.buttons.confirm}: ${label(row)}`.slice(0, 60),
          callback_data: `pend:${row.id}`,
        },
      ]),
    );
  }

  async confirmPending(
    turn: BotTurn,
    userId: string,
    id: string,
    callbackId: string,
  ): Promise<void> {
    const row = await turn.tx.transaction.findFirst({
      where: { id, userId, status: 'PENDING', date: { lte: localDateToUtc(this.clock.today()) } },
      include: { category: true },
    });
    if (!row) {
      turn.replies.push({ kind: 'answer', callbackId, text: T.alreadySaved });
      return;
    }
    turn.replies.push({ kind: 'answer', callbackId });
    // The confirmation freezes the rate of the day (MOV-05): the same service as the app.
    await this.transactions.confirmIn(turn.tx, userId, { items: [{ id }] });
    say(turn, T.pendingConfirmed(clean(row.description ?? row.category?.name ?? '')));
  }

  /** The next 5 payments: statements, fixed items and scheduled movements. */
  async upcoming(turn: BotTurn, userId: string): Promise<void> {
    const dashboard = await this.dashboard.get(userId);
    const items = dashboard.upcoming
      .filter((item) => item.type === 'STATEMENT' || item.kind === 'EXPENSE')
      .slice(0, UPCOMING_LIMIT);
    if (items.length === 0) {
      say(turn, T.upcomingEmpty);
      return;
    }
    const lines = items.map((item) => {
      if (item.type === 'STATEMENT') {
        const parts = [
          item.ARS !== '0.00' ? money(item.ARS, 'ARS') : null,
          item.USD !== '0.00' ? money(item.USD, 'USD') : null,
        ].filter(Boolean);
        return `• ${dayMonth(item.date)} · Resumen ${clean(item.cardName)} · ${parts.join(' + ') || money('0', 'ARS')}`;
      }
      const name = item.type === 'FIXED' ? item.name : item.description;
      return `• ${dayMonth(item.date)} · ${clean(name)} · ${money(item.amount, item.currency)} · ${clean(item.accountName)}`;
    });
    say(turn, [T.upcomingTitle, ...lines].join('\n'));
  }

  /** The last movement entered by the bot in the last 24 hours, if it can still be deleted. */
  async undo(turn: BotTurn, userId: string): Promise<void> {
    const last = await this.lastFromBot(turn, userId);
    if (!last) {
      say(turn, T.undoNothing);
      return;
    }
    if (last.closed) {
      say(turn, T.undoClosed);
      return;
    }
    say(turn, T.undoAsk(last.what), [
      [
        { text: T.buttons.undoYes, callback_data: `undo:${last.kind}:${last.id}` },
        { text: T.buttons.no, callback_data: `keep:${last.id}` },
      ],
    ]);
  }

  async confirmUndo(
    turn: BotTurn,
    userId: string,
    kind: string,
    id: string,
    callbackId: string,
  ): Promise<void> {
    turn.replies.push({ kind: 'answer', callbackId });
    const last = await this.lastFromBot(turn, userId);
    // Only the last one of the bot, and only once.
    if (!last || last.id !== id || last.kind !== kind) {
      say(turn, T.undoNothing);
      return;
    }
    if (last.closed) {
      say(turn, T.undoClosed);
      return;
    }
    if (kind === 'C') await turn.tx.cardCharge.delete({ where: { id } });
    else await turn.tx.transaction.delete({ where: { id } });
    say(turn, T.undoDone);
  }

  private async lastFromBot(turn: BotTurn, userId: string) {
    const since = new Date(turn.now.getTime() - UNDO_WINDOW_MS);
    const where = { userId, channel: 'TELEGRAM' as const, createdAt: { gte: since } };
    const [transaction, charge] = await Promise.all([
      turn.tx.transaction.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      turn.tx.cardCharge.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        include: { installments: { include: { statement: { select: { status: true } } } } },
      }),
    ]);
    if (charge && (!transaction || charge.createdAt > transaction.createdAt)) {
      return {
        kind: 'C' as const,
        id: charge.id,
        closed: charge.installments.some((i) => isStatementClosed(i.statement.status)),
        what: `el consumo de ${money(charge.totalAmount.toFixed(2), charge.currency)} (${clean(charge.description)}) del ${dayMonth(utcToLocalDate(charge.date))}`,
      };
    }
    if (!transaction) return null;
    const noun = transaction.type === 'INCOME' ? 'el ingreso' : 'el gasto';
    return {
      kind: 'T' as const,
      id: transaction.id,
      closed: false,
      what: `${noun} de ${money(transaction.amount.toFixed(2), transaction.currency)} (${clean(transaction.description ?? transaction.category?.name ?? '')}) del ${dayMonth(utcToLocalDate(transaction.date))}`,
    };
  }
}
