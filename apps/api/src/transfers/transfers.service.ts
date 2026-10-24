import { HttpStatus, Injectable } from '@nestjs/common';
import type { CreateTransferRequest, Transfer } from '@platin/contracts';
import { Currency, impliedRate, Money } from '@platin/domain';
import { AccountsService } from '../accounts/accounts.service';
import { AppException } from '../common/app-exception';
import { date, money, toDbDate } from '../common/serialize';
import type { Account, Transfer as TransferRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function toTransferDto(row: TransferRow, currencyOut: Currency): Transfer {
  const out = Money.of(row.amountOut.toFixed(2), currencyOut);
  const into = Money.of(row.amountIn.toFixed(2), row.currencyIn);
  return {
    id: row.id,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    statementId: row.statementId,
    amountOut: money(row.amountOut),
    currencyOut,
    amountIn: money(row.amountIn),
    currencyIn: row.currencyIn,
    impliedRate: impliedRate(out, into) ?? null,
    date: date(row.date),
    description: row.description,
  };
}

/**
 * MOV-02. Between currencies the rate is the one implied by the two amounts the user typed;
 * the rates API is not involved.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async create(userId: string, request: CreateTransferRequest): Promise<Transfer> {
    const from = await this.accounts.getActive(userId, request.fromAccountId);
    const to = await this.accounts.getActive(userId, request.toAccountId);
    const amountIn = this.amountIn(from, to, request);

    const row = await this.prisma.transfer.create({
      data: {
        userId,
        fromAccountId: from.id,
        toAccountId: to.id,
        amountOut: Money.of(request.amountOut, from.currency).toString(),
        amountIn: amountIn.toString(),
        currencyIn: to.currency,
        date: toDbDate(request.date),
        description: request.description || null,
      },
    });
    return toTransferDto(row, from.currency);
  }

  async get(userId: string, id: string): Promise<Transfer> {
    const row = await this.getOwned(userId, id);
    const from = await this.accounts.getOwned(userId, row.fromAccountId);
    return toTransferDto(row, from.currency);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.getOwned(userId, id);
    if (row.statementId) {
      throw new AppException(
        'STATEMENT_PAYMENT',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Statement payments are removed from the card',
      );
    }
    await this.prisma.transfer.delete({ where: { id } });
  }

  private amountIn(from: Account, to: Account, request: CreateTransferRequest): Money {
    if (from.currency === to.currency) {
      if (
        request.amountIn &&
        !Money.of(request.amountIn, to.currency).equals(Money.of(request.amountOut, to.currency))
      ) {
        throw new AppException(
          'TRANSFER_AMOUNTS_DIFFER',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Between accounts of the same currency both amounts must match',
        );
      }
      return Money.of(request.amountOut, to.currency);
    }
    if (!request.amountIn) {
      throw new AppException(
        'TRANSFER_AMOUNT_IN_REQUIRED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Between currencies, the amount received is required',
      );
    }
    return Money.of(request.amountIn, to.currency);
  }

  private async getOwned(userId: string, id: string): Promise<TransferRow> {
    const row = await this.prisma.transfer.findFirst({ where: { id, userId } });
    if (!row) throw AppException.notFound('Transfer not found');
    return row;
  }
}
