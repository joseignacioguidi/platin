import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AdjustBalanceRequest,
  CreatePocketRequest,
  Pocket,
  Transaction,
  UpdatePocketRequest,
} from '@platin/contracts';
import { balanceAdjustment, Money } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { freezeBase } from '../common/base-conversion';
import { money, toDbDate } from '../common/serialize';
import { Prisma, type Pocket as PocketRow } from '../generated/prisma/client';
import { EntitlementsService } from '../plans/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRates } from '../rates/user-rates.service';
import { toTransactionDto } from '../transactions/transaction.mapper';
import { PocketBalancesService } from './pocket-balances.service';

/** A pocket with the name of its account, as most queries load it. */
export type PocketWithAccount = PocketRow & { account: { name: string; archivedAt: Date | null } };

export const WITH_ACCOUNT = { account: { select: { name: true, archivedAt: true } } } as const;

export function toPocketDto(row: PocketWithAccount, balance: Money): Pocket {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.account.name,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    instrument: row.instrument,
    initialBalance: money(row.initialBalance),
    includeInNetWorth: row.includeInNetWorth,
    archived: row.archivedAt !== null,
    balance: balance.toString(),
  };
}

/** CTA-02, 04, 06, 07: the pockets inside an account. */
@Injectable()
export class PocketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: PocketBalancesService,
    private readonly rates: UserRates,
    private readonly entitlements: EntitlementsService,
  ) {}

  async get(userId: string, id: string): Promise<Pocket> {
    const row = await this.getOwned(userId, id);
    return toPocketDto(row, await this.balances.balance(userId, row));
  }

  async create(userId: string, accountId: string, request: CreatePocketRequest): Promise<Pocket> {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw AppException.notFound('Account not found');
    if (account.archivedAt) throw this.archived('ACCOUNT_ARCHIVED', 'The account is archived');
    // The "Disponible" of each account comes with it; added pockets count for the plan.
    if (request.kind === 'INVESTMENT') await this.entitlements.assertFeature(userId, 'investments');
    if (request.kind !== 'AVAILABLE') await this.entitlements.assertCanCreate(userId, 'pockets');
    try {
      const row = await this.prisma.pocket.create({
        data: {
          userId,
          accountId,
          name: request.name,
          kind: request.kind,
          currency: request.currency,
          instrument: request.kind === 'INVESTMENT' ? (request.instrument ?? 'OTHER') : null,
          initialBalance: request.initialBalance ?? '0',
          includeInNetWorth: request.includeInNetWorth ?? true,
          sortOrder: await this.prisma.pocket.count({ where: { accountId } }),
        },
        include: WITH_ACCOUNT,
      });
      return toPocketDto(row, Money.of(row.initialBalance.toFixed(2), row.currency));
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /** CTA-07: a pocket is archived only with a zero balance; its history stays. */
  async update(userId: string, id: string, changes: UpdatePocketRequest): Promise<Pocket> {
    const current = await this.getOwned(userId, id);
    const { archived, instrument, kind, ...rest } = changes;
    if (archived) {
      const balance = await this.balances.balance(userId, current);
      if (!balance.isZero()) {
        throw new AppException(
          'POCKET_NOT_EMPTY',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Only a pocket with a zero balance can be archived',
        );
      }
    }
    if (archived === false && current.account.archivedAt) {
      throw this.archived('ACCOUNT_ARCHIVED', 'The account is archived');
    }
    const nextKind = kind ?? current.kind;
    const nextInstrument =
      nextKind === 'INVESTMENT' ? (instrument ?? current.instrument ?? 'OTHER') : null;
    try {
      const row = await this.prisma.pocket.update({
        where: { id },
        data: {
          ...rest,
          kind: nextKind,
          instrument: nextInstrument,
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
        },
        include: WITH_ACCOUNT,
      });
      return toPocketDto(row, await this.balances.balance(userId, row));
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /** CTA-06: records the difference to the real balance as a signed ADJUSTMENT movement. */
  async adjust(
    userId: string,
    id: string,
    request: AdjustBalanceRequest,
  ): Promise<Transaction | null> {
    const pocket = await this.getActive(userId, id);
    const current = await this.balances.balance(userId, pocket);
    const difference = balanceAdjustment(current, Money.of(request.balance, pocket.currency));
    if (!difference) return null;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rate =
      request.exchangeRate ??
      (pocket.currency === user.baseCurrency
        ? undefined
        : ((await this.rates.sellFor(userId, request.date)) ?? undefined));
    const frozen = freezeBase(difference, user.baseCurrency, rate);
    const category = await this.prisma.category.findUnique({
      where: { userId_systemKey: { userId, systemKey: 'ADJUSTMENT' } },
      select: { id: true },
    });
    const row = await this.prisma.transaction.create({
      data: {
        userId,
        pocketId: pocket.id,
        categoryId: category?.id ?? null,
        type: 'ADJUSTMENT',
        origin: 'ADJUSTMENT',
        status: 'CONFIRMED',
        amount: difference.toString(),
        currency: pocket.currency,
        rateToBase: frozen.rateToBase,
        baseAmount: frozen.baseAmount,
        date: toDbDate(request.date),
        description: 'Ajuste de saldo',
      },
    });
    return toTransactionDto(row);
  }

  /** A pocket of the user (404 otherwise). */
  async getOwned(userId: string, id: string): Promise<PocketWithAccount> {
    const row = await this.prisma.pocket.findFirst({
      where: { id, userId },
      include: WITH_ACCOUNT,
    });
    if (!row) throw AppException.notFound('Pocket not found');
    return row;
  }

  /** A pocket of the user, not archived and in an active account (new movements need one). */
  async getActive(userId: string, id: string): Promise<PocketWithAccount> {
    const row = await this.getOwned(userId, id);
    if (row.archivedAt) throw this.archived('POCKET_ARCHIVED', 'The pocket is archived');
    if (row.account.archivedAt) throw this.archived('ACCOUNT_ARCHIVED', 'The account is archived');
    return row;
  }

  private archived(code: string, detail: string): AppException {
    return new AppException(code, HttpStatus.UNPROCESSABLE_ENTITY, detail);
  }

  private duplicate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new AppException(
        'POCKET_EXISTS',
        HttpStatus.CONFLICT,
        'The account already has a pocket with that name and currency',
      );
    }
    return error;
  }
}
