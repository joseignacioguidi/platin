import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Account,
  AccountsResponse,
  ColorToken,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '@platin/contracts';
import { accountTotals, Currency, Money } from '@platin/domain';
import { AppException } from '../common/app-exception';
import {
  Prisma,
  type Account as AccountRow,
  type Pocket as PocketRow,
} from '../generated/prisma/client';
import { EntitlementsService } from '../plans/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { PocketBalancesService } from './pocket-balances.service';
import { toPocketDto } from './pockets.service';

/** Name of the pocket every account is born with (CTA-02). */
export const AVAILABLE_POCKET_NAME = 'Disponible';

type AccountWithPockets = AccountRow & { pockets: PocketRow[] };

const totalsDto = (totals: Record<Currency, Money>) => ({
  ARS: totals.ARS.toString(),
  USD: totals.USD.toString(),
});

/** CTA-01, 03, 07: accounts (institutions) with their pockets and totals per currency. */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: PocketBalancesService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(userId: string, includeArchived = false): Promise<AccountsResponse> {
    const rows = await this.prisma.account.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: {
        pockets: {
          where: includeArchived ? {} : { archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const balances = await this.balances.balances(
      userId,
      rows.flatMap((row) => row.pockets),
    );
    const items = rows.map((row) => this.toDto(row, balances));
    const counted = rows
      .filter((row) => !row.archivedAt)
      .flatMap((row) => row.pockets)
      .filter((pocket) => pocket.includeInNetWorth && !pocket.archivedAt)
      .map((pocket) => ({ balance: balances.get(pocket.id) ?? Money.zero(pocket.currency) }));
    return { items, totals: totalsDto(accountTotals(counted)) };
  }

  async get(userId: string, id: string): Promise<Account> {
    const row = await this.prisma.account.findFirst({
      where: { id, userId },
      include: { pockets: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!row) throw AppException.notFound('Account not found');
    const balances = await this.balances.balances(userId, row.pockets);
    return this.toDto(row, balances);
  }

  /** CTA-01/02: the account and its "Disponible" pocket in pesos, with today's balance. */
  async create(userId: string, request: CreateAccountRequest): Promise<Account> {
    try {
      const id = await this.entitlements.withinLimits(userId, { accounts: 1 }, async (tx) => {
        const account = await tx.account.create({
          data: {
            userId,
            name: request.name,
            kind: request.kind,
            color: request.color ?? null,
            sortOrder: await tx.account.count({ where: { userId } }),
          },
        });
        await tx.pocket.create({
          data: {
            userId,
            accountId: account.id,
            name: AVAILABLE_POCKET_NAME,
            kind: 'AVAILABLE',
            currency: 'ARS',
            initialBalance: request.initialBalance ?? '0',
          },
        });
        return account.id;
      });
      return this.get(userId, id);
    } catch (error) {
      throw this.duplicate(error);
    }
  }

  /** CTA-07: archiving an account archives its pockets; all of them must be at zero. */
  async update(userId: string, id: string, changes: UpdateAccountRequest): Promise<Account> {
    const current = await this.prisma.account.findFirst({
      where: { id, userId },
      include: { pockets: true },
    });
    if (!current) throw AppException.notFound('Account not found');
    const { archived, ...rest } = changes;
    if (archived) {
      const balances = await this.balances.balances(userId, current.pockets);
      if ([...balances.values()].some((balance) => !balance.isZero())) {
        throw new AppException(
          'ACCOUNT_NOT_EMPTY',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Only an account whose pockets are all at zero can be archived',
        );
      }
    }
    // Restoring an account brings back its pockets too: all of them must fit the plan (SEC-F05).
    const restoring = archived === false && current.archivedAt !== null;
    const needs = restoring
      ? {
          accounts: 1,
          pockets: current.pockets.filter((p) => p.kind !== 'AVAILABLE' && p.archivedAt).length,
        }
      : {};
    try {
      await this.entitlements.withinLimits(userId, needs, async (tx) => {
        await tx.account.update({
          where: { id },
          data: {
            ...rest,
            ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
          },
        });
        if (archived !== undefined) {
          await tx.pocket.updateMany({
            where: { accountId: id },
            data: { archivedAt: archived ? new Date() : null },
          });
        }
      });
    } catch (error) {
      throw this.duplicate(error);
    }
    return this.get(userId, id);
  }

  private toDto(row: AccountWithPockets, balances: Map<string, Money>): Account {
    const pockets = row.pockets.map((pocket) =>
      toPocketDto(
        { ...pocket, account: { name: row.name, archivedAt: row.archivedAt } },
        balances.get(pocket.id) ?? Money.zero(pocket.currency),
      ),
    );
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      color: (row.color as ColorToken | null) ?? null,
      archived: row.archivedAt !== null,
      pockets,
      totals: totalsDto(
        accountTotals(
          row.pockets.map((pocket) => ({
            balance: balances.get(pocket.id) ?? Money.zero(pocket.currency),
            archived: pocket.archivedAt !== null,
          })),
        ),
      ),
    };
  }

  private duplicate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new AppException(
        'ACCOUNT_EXISTS',
        HttpStatus.CONFLICT,
        'There is already an account with that name',
      );
    }
    return error;
  }
}
