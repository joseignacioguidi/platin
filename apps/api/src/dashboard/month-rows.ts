import type { ColorToken, MonthGroup } from '@platin/contracts';
import {
  CardCycle,
  Currency,
  Money,
  MonthFlowCurrency,
  Period,
  PocketKind,
  StatementDates,
  statementPurchaseRange,
  utcToLocalDate,
  utcToPeriod,
} from '@platin/domain';
import type { Prisma } from '../generated/prisma/client';
import {
  TRANSACTION_MOVEMENT_INCLUDE,
  TRANSFER_MOVEMENT_INCLUDE,
  toTransactionMovement,
  toTransferMovement,
  TransactionMovementRow,
  TransferMovementRow,
} from '../movements/movements.service';
import { PrismaService } from '../prisma/prisma.service';

/** The month's confirmed movements and transfers that touch the spendable pockets. */
export interface MonthRows {
  transactions: TransactionMovementRow[];
  transfers: TransferMovementRow[];
}

/** A spendable pocket (account balance or spending reserve) with its balances. */
export interface SpendablePocket {
  id: string;
  currency: Currency;
  opening: Money;
  closing: Money;
}

const ORDER = [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] as const;

/** Statement periods paid this month, by card, to name the purchases they cover. */
export interface PaidStatementCards {
  cycles: Map<string, CardCycle>;
  /** Real dates of the statements around the paid ones, by card and period. */
  dates: Map<string, Map<Period, StatementDates>>;
}

export async function loadMonthRows(
  prisma: PrismaService,
  userId: string,
  pocketIds: string[],
  date: Prisma.DateTimeFilter,
): Promise<MonthRows> {
  if (pocketIds.length === 0) return { transactions: [], transfers: [] };
  const [transactions, transfers] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, pocketId: { in: pocketIds }, status: 'CONFIRMED', date },
      include: TRANSACTION_MOVEMENT_INCLUDE,
      orderBy: [...ORDER],
    }),
    prisma.transfer.findMany({
      where: {
        userId,
        date,
        OR: [{ fromPocketId: { in: pocketIds } }, { toPocketId: { in: pocketIds } }],
      },
      include: TRANSFER_MOVEMENT_INCLUDE,
      orderBy: [...ORDER],
    }),
  ]);
  return { transactions, transfers };
}

const isStored = (kind: PocketKind) =>
  kind === PocketKind.SAVINGS || kind === PocketKind.INVESTMENT;

type TransferRole =
  | { role: 'PAYMENT' }
  | { role: 'TO_RESERVE'; pocketId: string }
  | { role: 'FROM_RESERVE'; pocketId: string }
  | { role: 'EXCHANGE'; out: boolean; in: boolean };

/** What a transfer is for the spendable pockets (`ids`). */
function roleOf(transfer: TransferMovementRow, ids: ReadonlySet<string>): TransferRole {
  const fromIn = ids.has(transfer.fromPocketId);
  const to = transfer.toPocket;
  const toIn = !!to && ids.has(to.id);
  if (fromIn && !to) return { role: 'PAYMENT' };
  if (fromIn && to && !toIn && isStored(to.kind)) return { role: 'TO_RESERVE', pocketId: to.id };
  if (!fromIn && toIn && isStored(transfer.fromPocket.kind)) {
    return { role: 'FROM_RESERVE', pocketId: transfer.fromPocket.id };
  }
  // Between spendable pockets (it only shows when the currencies differ) or with one that is
  // archived.
  return { role: 'EXCHANGE', out: fromIn, in: toIn };
}

const money = (value: { toFixed(digits: number): string }, currency: Currency) =>
  Money.of(value.toFixed(2), currency);

/** The rows grouped by currency as `monthFlow` takes them. */
export function flowByCurrency(
  rows: MonthRows,
  pockets: readonly SpendablePocket[],
): MonthFlowCurrency[] {
  const flows = new Map<Currency, MonthFlowCurrency>();
  const flow = (currency: Currency): MonthFlowCurrency => {
    let found = flows.get(currency);
    if (!found) {
      const zero = Money.zero(currency);
      found = {
        currency,
        opening: zero,
        income: zero,
        expenses: zero,
        statementPayments: zero,
        toReserves: zero,
        fromReserves: zero,
        adjustments: zero,
        exchanged: zero,
        closing: zero,
      };
      flows.set(currency, found);
    }
    return found;
  };
  for (const pocket of pockets) {
    const f = flow(pocket.currency);
    f.opening = f.opening.add(pocket.opening);
    f.closing = f.closing.add(pocket.closing);
  }
  for (const tx of rows.transactions) {
    const f = flow(tx.currency);
    const amount = money(tx.amount, tx.currency);
    if (tx.type === 'INCOME') f.income = f.income.add(amount);
    else if (tx.type === 'EXPENSE') f.expenses = f.expenses.add(amount);
    else f.adjustments = f.adjustments.add(amount);
  }
  const ids = new Set(pockets.map((p) => p.id));
  for (const transfer of rows.transfers) {
    const out = money(transfer.amountOut, transfer.fromPocket.currency);
    const into = money(transfer.amountIn, transfer.toPocket?.currency ?? transfer.currencyIn);
    const role = roleOf(transfer, ids);
    if (role.role === 'PAYMENT') {
      const f = flow(out.currency);
      f.statementPayments = f.statementPayments.add(out);
    } else if (role.role === 'TO_RESERVE') {
      const f = flow(out.currency);
      f.toReserves = f.toReserves.add(out);
    } else if (role.role === 'FROM_RESERVE') {
      const f = flow(into.currency);
      f.fromReserves = f.fromReserves.add(into);
    } else {
      if (role.out) flow(out.currency).exchanged = flow(out.currency).exchanged.subtract(out);
      if (role.in) flow(into.currency).exchanged = flow(into.currency).exchanged.add(into);
    }
  }
  return [...flows.values()];
}

interface GroupDraft {
  key: string;
  name: string;
  category: MonthGroup['category'];
  purchases: MonthGroup['purchases'];
  amounts: Map<Currency, Money>;
  movements: MonthGroup['movements'];
}

/** Groups accumulated per currency and valued at the end. */
class Groups {
  private readonly drafts = new Map<string, GroupDraft>();

  add(
    key: string,
    init: Omit<GroupDraft, 'key' | 'amounts' | 'movements'>,
    amount: Money,
    movement: MonthGroup['movements'][number],
  ): void {
    let draft = this.drafts.get(key);
    if (!draft) {
      draft = { key, ...init, amounts: new Map(), movements: [] };
      this.drafts.set(key, draft);
    }
    const current = draft.amounts.get(amount.currency) ?? Money.zero(amount.currency);
    draft.amounts.set(amount.currency, current.add(amount));
    draft.movements.push(movement);
  }

  /** Largest first. */
  valued(toBase: (money: Money) => Money): (MonthGroup & { value: Money })[] {
    return [...this.drafts.values()]
      .map((draft) => {
        const value = [...draft.amounts.values()].map(toBase).reduce((sum, part) => sum.add(part));
        return {
          key: draft.key,
          name: draft.name,
          category: draft.category,
          purchases: draft.purchases,
          amount: value.toString(),
          movements: draft.movements,
          value,
        };
      })
      .sort((a, b) => b.value.compare(a.value) || a.name.localeCompare(b.name, 'es'));
  }
}

/** The 6 largest categories of expenses; the rest together as "OTHER". */
const TOP_CATEGORIES = 6;

const strip = ({ value: _value, ...group }: MonthGroup & { value: Money }): MonthGroup => group;

function categoryOf(tx: TransactionMovementRow) {
  return tx.category
    ? {
        key: tx.category.id,
        name: tx.category.name,
        category: { ...tx.category, color: tx.category.color as ColorToken },
      }
    : { key: 'NONE', name: '', category: null };
}

/** DAS-05, the month summary groups (amounts in base currency with `toBase`). */
export function summaryGroups(
  rows: MonthRows,
  pocketIds: ReadonlySet<string>,
  cards: PaidStatementCards,
  toBase: (money: Money) => Money,
): {
  income: MonthGroup[];
  paidByCategory: MonthGroup[];
  paidByCard: MonthGroup[];
  reservedByPocket: MonthGroup[];
} {
  const income = new Groups();
  const expenses = new Groups();
  const statements = new Groups();
  const reserves = new Groups();

  for (const tx of rows.transactions) {
    const amount = money(tx.amount, tx.currency);
    const group = categoryOf(tx);
    const target = tx.type === 'INCOME' ? income : tx.type === 'EXPENSE' ? expenses : null;
    target?.add(group.key, { ...group, purchases: null }, amount, toTransactionMovement(tx));
  }

  for (const transfer of rows.transfers) {
    const role = roleOf(transfer, pocketIds);
    const out = money(transfer.amountOut, transfer.fromPocket.currency);
    const movement = toTransferMovement(transfer);
    if (role.role === 'PAYMENT' && transfer.statement) {
      const card = transfer.statement.card;
      statements.add(card.id, { name: card.name, category: null, purchases: null }, out, movement);
    } else if (role.role === 'TO_RESERVE' && transfer.toPocket) {
      reserves.add(
        role.pocketId,
        { name: transfer.toPocket.name, category: null, purchases: null },
        out,
        movement,
      );
    } else if (role.role === 'FROM_RESERVE') {
      const into = money(transfer.amountIn, transfer.currencyIn);
      reserves.add(
        role.pocketId,
        { name: transfer.fromPocket.name, category: null, purchases: null },
        into.negate(),
        movement,
      );
    }
  }

  const byCategory = expenses.valued(toBase);
  const rest = byCategory.slice(TOP_CATEGORIES);
  const paidByCategory = byCategory.slice(0, TOP_CATEGORIES).map(strip);
  if (rest.length > 0) {
    paidByCategory.push({
      key: 'OTHER',
      name: '',
      category: null,
      purchases: null,
      amount: Money.sum(
        rest.map((g) => g.value),
        rest[0].value.currency,
      ).toString(),
      movements: rest
        .flatMap((g) => g.movements)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    });
  }

  const paidByCard = statements.valued(toBase).map((group) => {
    const periods = new Set(
      group.movements.flatMap((m) =>
        m.kind === 'TRANSFER' && m.statement ? [m.statement.period as Period] : [],
      ),
    );
    return { ...strip(group), purchases: purchasesOf(group.key, [...periods].sort(), cards) };
  });

  return {
    income: income.valued(toBase).map(strip),
    paidByCategory,
    paidByCard,
    reservedByPocket: reserves.valued(toBase).map(strip),
  };
}

/** From the first purchase day of the earliest statement to the closing of the latest one. */
function purchasesOf(
  cardId: string,
  periods: Period[],
  cards: PaidStatementCards,
): MonthGroup['purchases'] {
  const cycle = cards.cycles.get(cardId);
  if (!cycle || periods.length === 0) return null;
  const overrides = cards.dates.get(cardId) ?? new Map();
  return {
    from: statementPurchaseRange(cycle, periods[0], overrides).from,
    to: statementPurchaseRange(cycle, periods[periods.length - 1], overrides).to,
  };
}

/** The cards and statement dates `purchasesOf` needs for the statements paid this month. */
export async function paidStatementCards(
  prisma: PrismaService,
  userId: string,
  rows: MonthRows,
): Promise<PaidStatementCards> {
  const cardIds = [
    ...new Set(rows.transfers.flatMap((t) => (t.statement ? [t.statement.card.id] : []))),
  ];
  if (cardIds.length === 0) return { cycles: new Map(), dates: new Map() };
  const [cards, statements] = await Promise.all([
    prisma.creditCard.findMany({
      where: { userId, id: { in: cardIds } },
      select: { id: true, closingDay: true, dueDay: true },
    }),
    prisma.cardStatement.findMany({
      where: { userId, cardId: { in: cardIds } },
      select: { cardId: true, period: true, closingDate: true, dueDate: true },
    }),
  ]);
  const dates = new Map<string, Map<Period, StatementDates>>();
  for (const s of statements) {
    const byPeriod = dates.get(s.cardId) ?? new Map<Period, StatementDates>();
    byPeriod.set(utcToPeriod(s.period), {
      closingDate: utcToLocalDate(s.closingDate),
      dueDate: utcToLocalDate(s.dueDate),
    });
    dates.set(s.cardId, byPeriod);
  }
  return { cycles: new Map(cards.map((c) => [c.id, c])), dates };
}
