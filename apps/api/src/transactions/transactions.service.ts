import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ConfirmTransactionsRequest,
  CreateTransactionRequest,
  Transaction,
  UpdateTransactionRequest,
} from '@platin/contracts';
import { Currency, Decimal, LocalDate, Money, utcToLocalDate } from '@platin/domain';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { AppException } from '../common/app-exception';
import { freezeBase } from '../common/base-conversion';
import { toDbDate } from '../common/serialize';
import type { Transaction as TransactionRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRates } from '../rates/user-rates.service';
import { toTransactionDto } from './transaction.mapper';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly rates: UserRates,
  ) {}

  async get(userId: string, id: string): Promise<Transaction> {
    return toTransactionDto(await this.getOwned(userId, id));
  }

  /** MOV-01. The amount is in the account currency; its base value is frozen now. */
  async create(userId: string, request: CreateTransactionRequest): Promise<Transaction> {
    const account = await this.accounts.getActive(userId, request.accountId);
    await this.categories.getOwned(userId, request.categoryId, request.type);
    const baseCurrency = await this.baseCurrency(userId);
    const amount = Money.of(request.amount, account.currency);
    const rate =
      request.exchangeRate ?? (await this.rateOfDay(userId, amount, baseCurrency, request.date));
    const frozen = freezeBase(amount, baseCurrency, rate);

    const row = await this.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: request.categoryId,
        type: request.type,
        amount: amount.toString(),
        currency: account.currency,
        rateToBase: frozen.rateToBase,
        baseAmount: frozen.baseAmount,
        date: toDbDate(request.date),
        description: request.description || null,
      },
    });
    return toTransactionDto(row);
  }

  /**
   * MOV-04. Changing the amount, account or rate re-freezes the base value; otherwise the
   * frozen rate is kept (history is not recalculated).
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
    const account = changes.accountId
      ? await this.accounts.getActive(userId, changes.accountId)
      : await this.accounts.getOwned(userId, current.accountId);
    if (changes.categoryId)
      await this.categories.getOwned(userId, changes.categoryId, current.type);

    const amount = Money.of(changes.amount ?? current.amount.toFixed(2), account.currency);
    const needsRefreeze =
      changes.amount !== undefined ||
      changes.exchangeRate !== undefined ||
      account.currency !== current.currency;
    const baseCurrency = await this.baseCurrency(userId);
    const date = changes.date ?? utcToLocalDate(current.date);
    const frozen = needsRefreeze
      ? freezeBase(
          amount,
          baseCurrency,
          changes.exchangeRate ??
            (account.currency === current.currency ? this.storedRate(current) : undefined) ??
            (await this.rateOfDay(userId, amount, baseCurrency, date)),
        )
      : undefined;

    const row = await this.prisma.transaction.update({
      where: { id },
      data: {
        accountId: account.id,
        currency: account.currency,
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
    await this.getOwned(userId, id);
    await this.prisma.transaction.delete({ where: { id } });
  }

  /**
   * MOV-05: confirms pending movements in one transaction. A corrected amount re-freezes the
   * base value with the rate stored when the pending movement was generated.
   */
  async confirm(userId: string, request: ConfirmTransactionsRequest): Promise<Transaction[]> {
    const ids = request.items.map((item) => item.id);
    const rows = await this.prisma.transaction.findMany({ where: { id: { in: ids }, userId } });
    if (rows.length !== new Set(ids).size) throw AppException.notFound('Movement not found');
    const baseCurrency = await this.baseCurrency(userId);
    // Unfrozen pending movements take the rate of their own date (ADR 0008).
    const ratesOfDay = new Map<string, string | undefined>();
    for (const row of rows) {
      if (row.rateToBase.isZero() && row.currency !== baseCurrency) {
        const amount = Money.of(row.amount.toFixed(2), row.currency);
        ratesOfDay.set(
          row.id,
          await this.rateOfDay(userId, amount, baseCurrency, utcToLocalDate(row.date)),
        );
      }
    }

    const updated = await this.prisma.$transaction(
      request.items.map((item) => {
        const row = rows.find((r) => r.id === item.id) as TransactionRow;
        const amount = Money.of(item.amount ?? row.amount.toFixed(2), row.currency);
        // Pending movements in another currency arrive without a frozen rate (ADR 0008):
        // it is frozen now, with the rate sent or, from phase 6, the one of the day.
        const unfrozen = row.rateToBase.isZero();
        const rate =
          item.exchangeRate ?? (unfrozen ? ratesOfDay.get(row.id) : this.storedRate(row));
        const frozen = item.amount || unfrozen ? freezeBase(amount, baseCurrency, rate) : undefined;
        return this.prisma.transaction.update({
          where: { id: row.id },
          data: { status: 'CONFIRMED', amount: amount.toString(), ...(frozen ?? {}) },
        });
      }),
    );
    return updated.map(toTransactionDto);
  }

  /** The rate of the user's preferred type for that date, when the amount needs one. */
  private async rateOfDay(
    userId: string,
    amount: Money,
    baseCurrency: Currency,
    day: LocalDate,
  ): Promise<string | undefined> {
    if (amount.currency === baseCurrency) return undefined;
    return (await this.rates.sellFor(userId, day)) ?? undefined;
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
   * The ARS-per-USD rate behind a stored movement, recovered from its frozen factor
   * (factor itself for USD→ARS, its inverse for ARS→USD). Undefined for same currency.
   */
  private storedRate(row: TransactionRow): string | undefined {
    const factor = row.rateToBase.toFixed(6);
    if (factor === '1.000000') return undefined;
    return row.currency === 'USD' ? factor : new Decimal(1).dividedBy(factor).toFixed(6);
  }
}
