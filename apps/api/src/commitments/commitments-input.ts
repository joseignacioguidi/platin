import { Injectable } from '@nestjs/common';
import {
  addMonths,
  CommitmentsInput,
  firstDayOf,
  lastDayOf,
  Money,
  Period,
  RateTable,
  StatementDates,
  utcToLocalDate,
  utcToPeriod,
} from '@platin/domain';
import { STATEMENT_PARTS, statementTotals } from '../cards/statement-math';
import { toDbDate, toDbPeriod } from '../common/serialize';
import { FIXED_INCLUDE, toSchedule } from '../fixed/fixed.mapper';
import { PrismaService } from '../prisma/prisma.service';

/** Supplies today's rates (pesos per unit) used to value commitments in the base currency. */
export abstract class CommitmentsRateSource {
  abstract today(userId: string): Promise<RateTable>;
}

/** What a scheduled movement shows besides its amount (category icon in the lists). */
export interface ScheduledInfo {
  pocketName: string;
  accountName: string;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export interface BuiltCommitments {
  input: CommitmentsInput;
  rates: RateTable;
  cardNames: Map<string, string>;
  scheduled: Map<string, ScheduledInfo>;
}

/**
 * Builds the one input of `commitmentsByMonth` for Compromisos and the home screen, so both read
 * the same statements, fixed items, generated movements and scheduled movements.
 */
@Injectable()
export class CommitmentsInputBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: CommitmentsRateSource,
  ) {}

  async build(userId: string, from: Period, to: Period): Promise<BuiltCommitments> {
    const range = { gte: toDbDate(firstDayOf(from)), lte: toDbDate(lastDayOf(to)) };
    // A card subscription late in a month is due up to two months later.
    const chargeFrom = addMonths(from, -2);
    const [user, statements, fixed, occurrences, charges, scheduled, rates] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.cardStatement.findMany({
        where: { userId, status: { not: 'PAID' }, dueDate: range },
        include: {
          ...STATEMENT_PARTS,
          installments: {
            select: {
              amount: true,
              currency: true,
              number: true,
              charge: { select: { id: true, description: true, installmentsCount: true } },
            },
            orderBy: { charge: { date: 'asc' } },
          },
          card: { select: { id: true, name: true } },
        },
      }),
      this.prisma.fixedItem.findMany({
        where: { userId },
        include: {
          ...FIXED_INCLUDE,
          card: {
            select: {
              id: true,
              name: true,
              closingDay: true,
              dueDay: true,
              statements: {
                where: { period: { gte: toDbPeriod(chargeFrom), lte: toDbPeriod(to) } },
                select: { period: true, closingDate: true, dueDate: true },
              },
            },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          origin: 'FIXED',
          fixedPeriod: { gte: toDbPeriod(from), lte: toDbPeriod(to) },
        },
        select: { fixedId: true, fixedPeriod: true, status: true, amount: true, currency: true },
      }),
      this.prisma.cardCharge.findMany({
        where: {
          userId,
          fixedId: { not: null },
          fixedPeriod: { gte: toDbPeriod(chargeFrom), lte: toDbPeriod(to) },
        },
        select: { fixedId: true, fixedPeriod: true },
      }),
      this.prisma.transaction.findMany({
        where: { userId, origin: 'SCHEDULED', status: 'PENDING', date: range },
        include: {
          pocket: { select: { name: true, account: { select: { name: true } } } },
          category: { select: { id: true, name: true, icon: true, color: true } },
        },
      }),
      this.rates.today(userId),
    ]);

    const cards = new Map<string, NonNullable<(typeof fixed)[number]['card']>>();
    for (const item of fixed) if (item.card) cards.set(item.card.id, item.card);
    const cardNames = new Map(statements.map((s) => [s.card.id, s.card.name]));
    for (const card of cards.values()) cardNames.set(card.id, card.name);

    const input: CommitmentsInput = {
      base: user.baseCurrency,
      // A currency without a known rate is reported in its line but not valued in base.
      rates,
      statements: statements.map((statement) => {
        const totals = statementTotals(statement);
        return {
          statementId: statement.id,
          cardId: statement.card.id,
          dueDate: utcToLocalDate(statement.dueDate),
          pending: [totals.pending.ARS, totals.pending.USD],
          partiallyPaid: !totals.paid.ARS.isZero() || !totals.paid.USD.isZero(),
          installments: statement.installments.map((i) => ({
            chargeId: i.charge.id,
            description: i.charge.description,
            number: i.number,
            count: i.charge.installmentsCount,
            amount: Money.of(i.amount.toFixed(2), i.currency),
          })),
        };
      }),
      fixed: fixed.map((f) => ({ ...toSchedule(f), id: f.id, name: f.name, cardId: f.cardId })),
      cards: [...cards.values()].map((card) => ({
        id: card.id,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        overrides: new Map<Period, StatementDates>(
          card.statements.map((s) => [
            utcToPeriod(s.period),
            { closingDate: utcToLocalDate(s.closingDate), dueDate: utcToLocalDate(s.dueDate) },
          ]),
        ),
      })),
      fixedOccurrences: occurrences
        .filter((o) => o.fixedId && o.fixedPeriod)
        .map((o) => ({
          fixedId: o.fixedId as string,
          period: utcToPeriod(o.fixedPeriod as Date),
          confirmed: o.status === 'CONFIRMED',
          amount: Money.of(o.amount.toFixed(2), o.currency),
        })),
      fixedCharges: new Set(
        charges.map((c) => `${c.fixedId}|${utcToPeriod(c.fixedPeriod as Date)}`),
      ),
      scheduled: scheduled.map((s) => ({
        id: s.id,
        kind: s.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        date: utcToLocalDate(s.date),
        amount: Money.of(s.amount.toFixed(2), s.currency),
        description: s.description ?? s.category?.name ?? '',
      })),
    };
    return {
      input,
      rates,
      cardNames,
      scheduled: new Map(
        scheduled.map((s) => [
          s.id,
          { pocketName: s.pocket.name, accountName: s.pocket.account.name, category: s.category },
        ]),
      ),
    };
  }
}
