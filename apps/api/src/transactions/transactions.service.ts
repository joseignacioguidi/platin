import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ConfirmTransactionsRequest,
  CreateTransactionRequest,
  Transaction,
  UpdateTransactionRequest,
} from '@platin/contracts';
import { Decimal, Money } from '@platin/domain';
import { AccountsService } from '../accounts/accounts.service';
import { CategoriesService } from '../categories/categories.service';
import { AppException } from '../common/app-exception';
import { freezeBase } from '../common/base-conversion';
import { toDbDate } from '../common/serialize';
import type { Transaction as TransactionRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toTransactionDto } from './transaction.mapper';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
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
    const frozen = freezeBase(amount, baseCurrency, request.exchangeRate);

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
    const frozen = needsRefreeze
      ? freezeBase(
          amount,
          await this.baseCurrency(userId),
          changes.exchangeRate ?? this.storedRate(current),
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

    const updated = await this.prisma.$transaction(
      request.items.map((item) => {
        const row = rows.find((r) => r.id === item.id) as TransactionRow;
        const amount = item.amount ? Money.of(item.amount, row.currency) : undefined;
        const frozen = amount ? freezeBase(amount, baseCurrency, this.storedRate(row)) : undefined;
        return this.prisma.transaction.update({
          where: { id: row.id },
          data: {
            status: 'CONFIRMED',
            ...(amount ? { amount: amount.toString(), ...frozen } : {}),
          },
        });
      }),
    );
    return updated.map(toTransactionDto);
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
