import { HttpStatus, Injectable } from '@nestjs/common';
import type { CreateTransferRequest, Transfer } from '@platin/contracts';
import {
  Currency,
  impliedRate,
  intentFits,
  Money,
  TransferIntent,
  transferIntent,
} from '@platin/domain';
import { PocketsService } from '../accounts/pockets.service';
import { AppException } from '../common/app-exception';
import { CurrenciesService } from '../common/currencies.service';
import { date, money, toDbDate } from '../common/serialize';
import type { Pocket, Transfer as TransferRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function toTransferDto(
  row: TransferRow,
  currencyOut: Currency,
  intent: TransferIntent | null,
): Transfer {
  const out = Money.of(row.amountOut.toFixed(2), currencyOut);
  const into = Money.of(row.amountIn.toFixed(2), row.currencyIn);
  return {
    id: row.id,
    fromPocketId: row.fromPocketId,
    toPocketId: row.toPocketId,
    intent,
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
 * MOV-02 / CTA-05 / INV-02: money between pockets of the same account or of another one.
 * Between currencies the rate is the one implied by the two amounts the user typed.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pockets: PocketsService,
    private readonly currencies: CurrenciesService,
  ) {}

  async create(userId: string, request: CreateTransferRequest): Promise<Transfer> {
    const from = await this.pockets.getActive(userId, request.fromPocketId);
    const to = await this.pockets.getActive(userId, request.toPocketId);
    await this.currencies.assertEnabled(userId, from.currency, to.currency);
    if (request.intent && !intentFits(request.intent, from.kind, to.kind)) {
      throw new AppException(
        'TRANSFER_INTENT_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        `The pockets don't fit a ${request.intent} transfer`,
      );
    }
    const amountIn = this.amountIn(from, to, request);

    const row = await this.prisma.transfer.create({
      data: {
        userId,
        fromPocketId: from.id,
        toPocketId: to.id,
        amountOut: Money.of(request.amountOut, from.currency).toString(),
        amountIn: amountIn.toString(),
        currencyIn: to.currency,
        date: toDbDate(request.date),
        description: request.description || null,
      },
    });
    return toTransferDto(row, from.currency, transferIntent(from.kind, to.kind));
  }

  async get(userId: string, id: string): Promise<Transfer> {
    const row = await this.getOwned(userId, id);
    const from = await this.pockets.getOwned(userId, row.fromPocketId);
    const to = row.toPocketId ? await this.pockets.getOwned(userId, row.toPocketId) : null;
    return toTransferDto(row, from.currency, to ? transferIntent(from.kind, to.kind) : null);
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

  private amountIn(from: Pocket, to: Pocket, request: CreateTransferRequest): Money {
    if (from.currency === to.currency) {
      if (
        request.amountIn &&
        !Money.of(request.amountIn, to.currency).equals(Money.of(request.amountOut, to.currency))
      ) {
        throw new AppException(
          'TRANSFER_AMOUNTS_DIFFER',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Between pockets of the same currency both amounts must match',
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
