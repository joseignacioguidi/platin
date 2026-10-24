import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateContributionRequest,
  CreateGoalRequest,
  Goal,
  GoalProjection,
  Savings,
  UpdateGoalRequest,
} from '@platin/contracts';
import {
  Currency,
  goalProjection,
  localDateAt,
  Money,
  parsePeriod,
  periodOf,
  utcToPeriod,
  valueIn,
} from '@platin/domain';
import { AccountBalancesService } from '../accounts/account-balances.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { date, money, toDbDate, toDbPeriod } from '../common/serialize';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';

const GOAL_INCLUDE = {
  accounts: { include: { account: true } },
  contributions: { orderBy: { date: 'asc' } },
} as const;
type GoalRow = Prisma.GoalGetPayload<{ include: typeof GOAL_INCLUDE }>;

/**
 * MET-01..05. A goal is measured against real accounts (their balance converted to the goal
 * currency with today's rate) or, without linked accounts, against assigned contributions.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: AccountBalancesService,
    private readonly rates: RatesService,
    private readonly clock: ClockService,
  ) {}

  async list(userId: string): Promise<Goal[]> {
    const rows = await this.prisma.goal.findMany({
      where: { userId },
      include: GOAL_INCLUDE,
      orderBy: [{ status: 'asc' }, { targetPeriod: 'asc' }],
    });
    const rate = await this.todayRate(userId);
    return Promise.all(rows.map((row) => this.toDto(userId, row, rate)));
  }

  async get(userId: string, id: string, monthly?: string): Promise<Goal> {
    return this.toDto(
      userId,
      await this.getOwned(userId, id),
      await this.todayRate(userId),
      monthly,
    );
  }

  /** MET-04: "if I save X per month, when do I get there?". */
  async projection(userId: string, id: string, monthly: string): Promise<GoalProjection> {
    return (await this.get(userId, id, monthly)).projection;
  }

  async create(userId: string, request: CreateGoalRequest): Promise<Goal> {
    await this.assertAccounts(userId, request.accountIds ?? []);
    const row = await this.prisma.goal.create({
      data: {
        userId,
        name: request.name,
        targetAmount: Money.of(request.targetAmount, request.currency).toString(),
        currency: request.currency,
        targetPeriod: toDbPeriod(parsePeriod(request.targetPeriod)),
        createdAt: this.clock.now(),
        accounts: { create: (request.accountIds ?? []).map((accountId) => ({ accountId })) },
      },
      include: GOAL_INCLUDE,
    });
    return this.toDto(userId, row, await this.todayRate(userId));
  }

  async update(userId: string, id: string, changes: UpdateGoalRequest): Promise<Goal> {
    const row = await this.getOwned(userId, id);
    if (changes.accountIds) await this.assertAccounts(userId, changes.accountIds);
    await this.prisma.$transaction(async (tx) => {
      await tx.goal.update({
        where: { id },
        data: {
          ...(changes.name ? { name: changes.name } : {}),
          ...(changes.status ? { status: changes.status } : {}),
          ...(changes.targetAmount
            ? { targetAmount: Money.of(changes.targetAmount, row.currency).toString() }
            : {}),
          ...(changes.targetPeriod ? { targetPeriod: toDbPeriod(changes.targetPeriod) } : {}),
        },
      });
      if (changes.accountIds) {
        await tx.goalAccount.deleteMany({ where: { goalId: id } });
        await tx.goalAccount.createMany({
          data: changes.accountIds.map((accountId) => ({ goalId: id, accountId })),
        });
      }
    });
    return this.get(userId, id);
  }

  async addContribution(
    userId: string,
    id: string,
    request: CreateContributionRequest,
  ): Promise<Goal> {
    const row = await this.getOwned(userId, id);
    await this.prisma.goalContribution.create({
      data: {
        goalId: id,
        amount: Money.of(request.amount, row.currency).toString(),
        date: toDbDate(request.date),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.goal.delete({ where: { id } });
  }

  /**
   * Total saved, valued in USD with the preferred rate: accounts of type savings (any
   * currency) and cash in dollars.
   */
  async savings(userId: string): Promise<Savings> {
    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        archivedAt: null,
        OR: [{ type: 'SAVINGS' }, { type: 'CASH', currency: 'USD' }],
      },
      orderBy: { createdAt: 'asc' },
    });
    const balances = await this.balances.balances(userId, accounts);
    const rate = await this.todayRate(userId);
    const sum = (currency: Currency) =>
      Money.sum(
        accounts
          .filter((a) => a.currency === currency)
          .map((a) => balances.get(a.id) ?? Money.zero(currency)),
        currency,
      );
    const usd = sum('USD');
    const ars = sum('ARS');
    const arsInUsd = rate ? valueIn(ars, 'USD', rate.sell) : Money.zero('USD');
    const usdInArs = rate ? valueIn(usd, 'ARS', rate.sell) : Money.zero('ARS');
    return {
      rate: rate ? { type: rate.type, sell: rate.sell } : null,
      totalUsd: usd.add(arsInUsd).toString(),
      totalArs: ars.add(usdInArs).toString(),
      usd: usd.toString(),
      ars: ars.toString(),
      arsInUsd: arsInUsd.toString(),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance: (balances.get(a.id) ?? Money.zero(a.currency)).toString(),
      })),
    };
  }

  private async toDto(
    userId: string,
    row: GoalRow,
    rate: { sell: string } | null,
    monthly?: string,
  ): Promise<Goal> {
    const balances = await this.balances.balances(
      userId,
      row.accounts.map((link) => link.account),
    );
    const convert = (m: Money) =>
      m.currency === row.currency
        ? m
        : rate
          ? valueIn(m, row.currency, rate.sell)
          : Money.zero(row.currency);
    const accounts = row.accounts.map(({ account }) => {
      const balance = balances.get(account.id) ?? Money.zero(account.currency);
      return { account, balance, converted: convert(balance) };
    });
    const accumulated =
      accounts.length > 0
        ? Money.sum(
            accounts.map((a) => a.converted),
            row.currency,
          )
        : Money.sum(
            row.contributions.map((c) => Money.of(c.amount.toFixed(2), row.currency)),
            row.currency,
          );
    const startPeriod = periodOf(localDateAt(row.createdAt));
    const projection = goalProjection(
      {
        targetAmount: Money.of(row.targetAmount.toFixed(2), row.currency),
        targetPeriod: utcToPeriod(row.targetPeriod),
        startPeriod,
      },
      accumulated,
      this.clock.today(),
      monthly ? Money.of(monthly, row.currency) : undefined,
    );
    return {
      id: row.id,
      name: row.name,
      targetAmount: money(row.targetAmount),
      currency: row.currency,
      targetPeriod: utcToPeriod(row.targetPeriod),
      startPeriod,
      status: row.status,
      accounts: accounts.map((a) => ({
        id: a.account.id,
        name: a.account.name,
        currency: a.account.currency,
        balance: a.balance.toString(),
        balanceInGoalCurrency: a.converted.toString(),
      })),
      contributions: row.contributions.map((c) => ({
        id: c.id,
        amount: money(c.amount),
        date: date(c.date),
      })),
      projection: {
        accumulated: projection.accumulated.toString(),
        remaining: projection.remaining.toString(),
        progress: projection.progress,
        monthsLeft: projection.monthsLeft,
        monthlyNeeded: projection.monthlyNeeded.toString(),
        expectedToDate: projection.expectedToDate.toString(),
        pace: projection.pace,
        paceDifference: projection.paceDifference.toString(),
        ...(projection.simulation
          ? {
              simulation: {
                monthly: projection.simulation.monthly.toString(),
                monthsNeeded: projection.simulation.monthsNeeded,
                reachedIn: projection.simulation.reachedIn,
                monthsBeforeTarget: projection.simulation.monthsBeforeTarget,
              },
            }
          : {}),
      },
    };
  }

  private async todayRate(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.rates.rateFor(user.valuationRate, this.clock.today());
  }

  private async assertAccounts(userId: string, accountIds: string[]): Promise<void> {
    if (accountIds.length === 0) return;
    const count = await this.prisma.account.count({ where: { userId, id: { in: accountIds } } });
    if (count !== new Set(accountIds).size) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Account not found');
    }
  }

  private async getOwned(userId: string, id: string): Promise<GoalRow> {
    const row = await this.prisma.goal.findFirst({ where: { id, userId }, include: GOAL_INCLUDE });
    if (!row) throw AppException.notFound('Goal not found');
    return row;
  }
}
