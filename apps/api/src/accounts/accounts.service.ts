import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Account,
  AccountsResponse,
  AdjustBalanceRequest,
  ColorToken,
  CreateAccountRequest,
  Transaction,
  UpdateAccountRequest,
} from '@platin/contracts';
import { balanceAdjustment, Money } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { freezeBase } from '../common/base-conversion';
import { money, toDbDate } from '../common/serialize';
import type { Account as AccountRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toTransactionDto } from '../transactions/transaction.mapper';
import { AccountBalancesService } from './account-balances.service';

export function toAccountDto(row: AccountRow, balance: Money): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    initialBalance: money(row.initialBalance),
    includeInNetWorth: row.includeInNetWorth,
    color: (row.color as ColorToken | null) ?? null,
    archived: row.archivedAt !== null,
    balance: balance.toString(),
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: AccountBalancesService,
  ) {}

  async list(userId: string, includeArchived = false): Promise<AccountsResponse> {
    const rows = await this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'asc' },
    });
    const balances = await this.balances.balances(userId, rows);
    const items = rows.map((row) =>
      toAccountDto(row, balances.get(row.id) ?? Money.zero(row.currency)),
    );
    const total = (currency: 'ARS' | 'USD') =>
      Money.sum(
        rows
          .filter((row) => row.currency === currency && row.includeInNetWorth && !row.archivedAt)
          .map((row) => balances.get(row.id) ?? Money.zero(currency)),
        currency,
      ).toString();
    return { items, totals: { ARS: total('ARS'), USD: total('USD') } };
  }

  async get(userId: string, id: string): Promise<Account> {
    const row = await this.getOwned(userId, id);
    return toAccountDto(row, await this.balances.balance(userId, row));
  }

  async create(userId: string, request: CreateAccountRequest): Promise<Account> {
    const row = await this.prisma.account.create({
      data: {
        userId,
        name: request.name,
        type: request.type,
        currency: request.currency,
        initialBalance: request.initialBalance ?? '0',
        includeInNetWorth: request.includeInNetWorth ?? true,
        color: request.color ?? null,
      },
    });
    return toAccountDto(row, Money.of(row.initialBalance.toFixed(2), row.currency));
  }

  async update(userId: string, id: string, changes: UpdateAccountRequest): Promise<Account> {
    await this.getOwned(userId, id);
    const { archived, ...rest } = changes;
    const row = await this.prisma.account.update({
      where: { id },
      data: {
        ...rest,
        ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      },
    });
    return toAccountDto(row, await this.balances.balance(userId, row));
  }

  /** CTA-04: records the difference to the real balance as a signed ADJUSTMENT movement. */
  async adjust(
    userId: string,
    id: string,
    request: AdjustBalanceRequest,
  ): Promise<Transaction | null> {
    const account = await this.getActive(userId, id);
    const current = await this.balances.balance(userId, account);
    const difference = balanceAdjustment(current, Money.of(request.balance, account.currency));
    if (!difference) return null;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const frozen = freezeBase(difference, user.baseCurrency, request.exchangeRate);
    const row = await this.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        type: 'ADJUSTMENT',
        origin: 'ADJUSTMENT',
        status: 'CONFIRMED',
        amount: difference.toString(),
        currency: account.currency,
        rateToBase: frozen.rateToBase,
        baseAmount: frozen.baseAmount,
        date: toDbDate(request.date),
        description: 'Ajuste de saldo',
      },
    });
    return toTransactionDto(row);
  }

  /** An account of the user (404 otherwise). */
  async getOwned(userId: string, id: string): Promise<AccountRow> {
    const row = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Account not found');
    return row;
  }

  /** An account of the user that is not archived (new movements can't use archived ones). */
  async getActive(userId: string, id: string): Promise<AccountRow> {
    const row = await this.getOwned(userId, id);
    if (row.archivedAt) {
      throw new AppException(
        'ACCOUNT_ARCHIVED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The account is archived',
      );
    }
    return row;
  }
}
