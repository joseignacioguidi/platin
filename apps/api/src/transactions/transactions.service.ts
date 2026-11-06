import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ConfirmTransactionsRequest,
  CreateTransactionRequest,
  Transaction,
  UpdateTransactionRequest,
} from '@platin/contracts';
import {
  compareDates,
  Currency,
  Decimal,
  LocalDate,
  Money,
  RatesInput,
  utcToLocalDate,
} from '@platin/domain';
import { PocketsService } from '../accounts/pockets.service';
import { CategoriesService } from '../categories/categories.service';
import { AppException } from '../common/app-exception';
import { freezeBase } from '../common/base-conversion';
import { ClockService } from '../common/clock.service';
import { CurrenciesService } from '../common/currencies.service';
import { toDbDate } from '../common/serialize';
import type { Channel, Prisma, Transaction as TransactionRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRates } from '../rates/user-rates.service';
import { toTransactionDto } from './transaction.mapper';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pockets: PocketsService,
    private readonly categories: CategoriesService,
    private readonly rates: UserRates,
    private readonly currencies: CurrenciesService,
    private readonly clock: ClockService,
  ) {}

  async get(userId: string, id: string): Promise<Transaction> {
    return toTransactionDto(await this.getOwned(userId, id));
  }

  /**
   * MOV-01. The amount is in the pocket currency; its base value is frozen now. MOV-08: with a
   * date after today it is scheduled: pending, valued with today's rate as an estimate, and
   * frozen again when it is confirmed.
   */
  async create(userId: string, request: CreateTransactionRequest): Promise<Transaction> {
    const id = await this.createIn(this.prisma, userId, request, 'APP');
    return this.get(userId, id);
  }

  /**
   * The same, writing with the caller's client: the bot creates the movement in the transaction
   * of its update (ADR 0026), marked with the channel it came in. Checks run before the write.
   */
  async createIn(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    request: CreateTransactionRequest,
    channel: Channel,
  ): Promise<string> {
    const pocket = await this.pockets.getAccountBalance(userId, request.pocketId);
    await this.categories.getOwned(userId, request.categoryId, request.type);
    await this.currencies.assertEnabled(userId, pocket.currency);
    const baseCurrency = await this.baseCurrency(userId);
    const amount = Money.of(request.amount, pocket.currency);
    const today = this.clock.today();
    const scheduled = compareDates(request.date, today) > 0;
    const rate =
      request.exchangeRate ??
      (await this.rateOfDay(userId, amount, baseCurrency, scheduled ? today : request.date));
    const frozen = freezeBase(amount, baseCurrency, rate);

    const row = await client.transaction.create({
      data: {
        userId,
        channel,
        pocketId: pocket.id,
        categoryId: request.categoryId,
        type: request.type,
        amount: amount.toString(),
        currency: pocket.currency,
        rateToBase: frozen.rateToBase,
        baseAmount: frozen.baseAmount,
        date: toDbDate(request.date),
        description: request.description || null,
        ...(scheduled ? { status: 'PENDING' as const, origin: 'SCHEDULED' as const } : {}),
      },
    });
    return row.id;
  }

  /**
   * MOV-04. Changing the amount or rate re-freezes the base value; otherwise the frozen rate is
   * kept (history is not recalculated). The pocket can change to another of the same currency.
   */
  async update(
    userId: string,
    id: string,
    changes: UpdateTransactionRequest,
  ): Promise<Transaction> {
    const current = await this.getOwned(userId, id);
    if (current.type === 'ADJUSTMENT') {
      throw new AppException(
        'ADJUSTMENT_NOT_EDITABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Balance adjustments can only be deleted',
      );
    }
    this.assertNotYield(current);
    const pocket = changes.pocketId
      ? await this.pockets.getAccountBalance(userId, changes.pocketId)
      : await this.pockets.getOwned(userId, current.pocketId);
    // MOV-04: another pocket (and account), only in the same currency: changing the currency
    // means deleting the movement and loading it again.
    if (pocket.currency !== current.currency) {
      throw new AppException(
        'CURRENCY_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The new pocket must be in the same currency as the movement',
      );
    }
    if (changes.categoryId)
      await this.categories.getOwned(
        userId,
        changes.categoryId,
        current.type as 'INCOME' | 'EXPENSE',
      );

    const amount = Money.of(changes.amount ?? current.amount.toFixed(2), pocket.currency);
    const needsRefreeze = changes.amount !== undefined || changes.exchangeRate !== undefined;
    const baseCurrency = await this.baseCurrency(userId);
    const date = changes.date ?? utcToLocalDate(current.date);
    // Only a pending movement can wait for a future date (MOV-08).
    if (current.status === 'CONFIRMED' && changes.date) this.clock.assertNotFuture(changes.date);
    const frozen = needsRefreeze
      ? freezeBase(
          amount,
          baseCurrency,
          changes.exchangeRate ??
            this.storedRate(current) ??
            (await this.rateOfDay(userId, amount, baseCurrency, date)),
        )
      : undefined;

    const row = await this.prisma.transaction.update({
      where: { id },
      data: {
        pocketId: pocket.id,
        currency: pocket.currency,
        amount: amount.toString(),
        ...(changes.categoryId ? { categoryId: changes.categoryId } : {}),
        ...(changes.date ? { date: toDbDate(changes.date) } : {}),
        ...(changes.description !== undefined ? { description: changes.description || null } : {}),
        ...(frozen ?? {}),
      },
    });
    return toTransactionDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    this.assertNotYield(await this.getOwned(userId, id));
    await this.prisma.transaction.delete({ where: { id } });
  }

  /** INV-04: yields come from valuations and are undone by deleting the valuation. */
  private assertNotYield(row: TransactionRow): void {
    if (row.type === 'YIELD') {
      throw new AppException(
        'YIELD_FROM_VALUATION',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Yields change through the valuations of the investment',
      );
    }
  }

  /**
   * MOV-05: confirms pending movements in one transaction, optionally with another amount and
   * date (never after today). A corrected amount re-freezes the base value with the rate stored
   * when the pending movement was generated; a scheduled one (MOV-08) is always frozen now, with
   * the rate of its date.
   */
  async confirm(userId: string, request: ConfirmTransactionsRequest): Promise<Transaction[]> {
    const updates = await this.confirmUpdates(userId, request);
    const updated = await this.prisma.$transaction(
      updates.map((args) => this.prisma.transaction.update(args)),
    );
    return updated.map(toTransactionDto);
  }

  /** The same, inside the caller's transaction (the bot's /pendientes). */
  async confirmIn(
    tx: Prisma.TransactionClient,
    userId: string,
    request: ConfirmTransactionsRequest,
  ): Promise<void> {
    for (const args of await this.confirmUpdates(userId, request)) {
      await tx.transaction.update(args);
    }
  }

  private async confirmUpdates(
    userId: string,
    request: ConfirmTransactionsRequest,
  ): Promise<Prisma.TransactionUpdateArgs[]> {
    const ids = request.items.map((item) => item.id);
    const rows = await this.prisma.transaction.findMany({ where: { id: { in: ids }, userId } });
    if (rows.length !== new Set(ids).size) throw AppException.notFound('Movement not found');
    const baseCurrency = await this.baseCurrency(userId);
    // Confirmed movements are dated up to today: one confirmed before its date (a fixed item
    // paid early, a scheduled one) takes today's date unless another one is sent.
    const today = this.clock.today();
    for (const item of request.items) if (item.date) this.clock.assertNotFuture(item.date);
    const dateOf = (item: ConfirmTransactionsRequest['items'][number], row: TransactionRow) => {
      const own = utcToLocalDate(row.date);
      return item.date ?? (compareDates(own, today) > 0 ? today : own);
    };
    // Unfrozen pending movements take the rate of their own date (ADR 0008); scheduled ones too.
    const ratesOfDay = new Map<string, RatesInput | undefined>();
    for (const item of request.items) {
      const row = rows.find((r) => r.id === item.id) as TransactionRow;
      const needsDayRate = row.rateToBase.isZero() || row.origin === 'SCHEDULED';
      if (needsDayRate && row.currency !== baseCurrency && !item.exchangeRate) {
        const amount = Money.of(row.amount.toFixed(2), row.currency);
        ratesOfDay.set(
          row.id,
          await this.rateOfDay(userId, amount, baseCurrency, dateOf(item, row)),
        );
      }
    }

    return request.items.map((item) => {
      const row = rows.find((r) => r.id === item.id) as TransactionRow;
      const amount = Money.of(item.amount ?? row.amount.toFixed(2), row.currency);
      // Pending movements in another currency arrive without a frozen rate (ADR 0008):
      // it is frozen now, with the rate sent or, from phase 6, the one of the day.
      const unfrozen = row.rateToBase.isZero() || row.origin === 'SCHEDULED';
      const rate = item.exchangeRate ?? (unfrozen ? ratesOfDay.get(row.id) : this.storedRate(row));
      const frozen = item.amount || unfrozen ? freezeBase(amount, baseCurrency, rate) : undefined;
      return {
        where: { id: row.id },
        data: {
          status: 'CONFIRMED' as const,
          amount: amount.toString(),
          date: toDbDate(dateOf(item, row)),
          ...(frozen ?? {}),
        },
      };
    });
  }

  /**
   * The rates of that date when the amount needs one: the dollar of the user's preferred type,
   * the other currencies at the oficial rate.
   */
  private async rateOfDay(
    userId: string,
    amount: Money,
    baseCurrency: Currency,
    day: LocalDate,
  ): Promise<RatesInput | undefined> {
    if (amount.currency === baseCurrency) return undefined;
    return this.rates.tableFor(userId, day);
  }

  private async getOwned(userId: string, id: string): Promise<TransactionRow> {
    const row = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Movement not found');
    return row;
  }

  private async baseCurrency(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return user.baseCurrency;
  }

  /**
   * The rate behind a stored movement, recovered from its frozen factor (base per unit of its
   * currency) in the single-rate convention of libs/domain: pesos per unit of the other
   * currency when one side is the peso. Undefined for the same currency.
   */
  private storedRate(row: TransactionRow): string | undefined {
    const factor = row.rateToBase.toFixed(6);
    if (factor === '1.000000') return undefined;
    return row.currency === 'ARS' ? new Decimal(1).dividedBy(factor).toFixed(6) : factor;
  }
}
