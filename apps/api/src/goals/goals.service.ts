import { HttpStatus, Injectable } from '@nestjs/common';
import type {
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
import { PocketBalancesService } from '../accounts/pocket-balances.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { money, toDbPeriod } from '../common/serialize';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';

const GOAL_INCLUDE = {
  pockets: {
    include: { pocket: { include: { account: { select: { name: true } } } } },
    // Stable order: the pockets as they were created.
    orderBy: { pocket: { createdAt: 'asc' } },
  },
} as const;
type GoalRow = Prisma.GoalGetPayload<{ include: typeof GOAL_INCLUDE }>;

/**
 * MET-01..05. A goal is measured against real pockets: the sum of their balances converted to
 * the goal currency with today's rate. To split money among goals, one pocket per goal.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: PocketBalancesService,
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
    await this.assertPockets(userId, request.pocketIds ?? []);
    const row = await this.prisma.goal.create({
      data: {
        userId,
        name: request.name,
        targetAmount: Money.of(request.targetAmount, request.currency).toString(),
        currency: request.currency,
        targetPeriod: toDbPeriod(parsePeriod(request.targetPeriod)),
        createdAt: this.clock.now(),
        pockets: { create: (request.pocketIds ?? []).map((pocketId) => ({ pocketId })) },
      },
      include: GOAL_INCLUDE,
    });
    return this.toDto(userId, row, await this.todayRate(userId));
  }

  async update(userId: string, id: string, changes: UpdateGoalRequest): Promise<Goal> {
    const row = await this.getOwned(userId, id);
    if (changes.pocketIds) await this.assertPockets(userId, changes.pocketIds);
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
      if (changes.pocketIds) {
        await tx.goalPocket.deleteMany({ where: { goalId: id } });
        await tx.goalPocket.createMany({
          data: changes.pocketIds.map((pocketId) => ({ goalId: id, pocketId })),
        });
      }
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.goal.delete({ where: { id } });
  }

  /**
   * Total saved, valued in USD with the preferred rate: the savings and investment pockets
   * that count for net worth, in any currency.
   */
  async savings(userId: string): Promise<Savings> {
    const pockets = await this.prisma.pocket.findMany({
      where: {
        userId,
        archivedAt: null,
        includeInNetWorth: true,
        kind: { in: ['SAVINGS', 'INVESTMENT'] },
        account: { archivedAt: null },
      },
      include: { account: { select: { name: true, sortOrder: true } } },
      orderBy: [{ account: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const balances = await this.balances.balances(userId, pockets);
    const rate = await this.todayRate(userId);
    const sum = (currency: Currency) =>
      Money.sum(
        pockets
          .filter((p) => p.currency === currency)
          .map((p) => balances.get(p.id) ?? Money.zero(currency)),
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
      pockets: pockets.map((p) => ({
        id: p.id,
        name: p.name,
        accountName: p.account.name,
        kind: p.kind,
        currency: p.currency,
        balance: (balances.get(p.id) ?? Money.zero(p.currency)).toString(),
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
      row.pockets.map((link) => link.pocket),
    );
    const convert = (m: Money) =>
      m.currency === row.currency
        ? m
        : rate
          ? valueIn(m, row.currency, rate.sell)
          : Money.zero(row.currency);
    const pockets = row.pockets.map(({ pocket }) => {
      const balance = balances.get(pocket.id) ?? Money.zero(pocket.currency);
      return { pocket, balance, converted: convert(balance) };
    });
    const accumulated = Money.sum(
      pockets.map((p) => p.converted),
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
      pockets: pockets.map((p) => ({
        id: p.pocket.id,
        name: p.pocket.name,
        accountName: p.pocket.account.name,
        currency: p.pocket.currency,
        balance: p.balance.toString(),
        balanceInGoalCurrency: p.converted.toString(),
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

  private async assertPockets(userId: string, pocketIds: string[]): Promise<void> {
    if (pocketIds.length === 0) return;
    const count = await this.prisma.pocket.count({ where: { userId, id: { in: pocketIds } } });
    if (count !== new Set(pocketIds).size) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Pocket not found');
    }
  }

  private async getOwned(userId: string, id: string): Promise<GoalRow> {
    const row = await this.prisma.goal.findFirst({ where: { id, userId }, include: GOAL_INCLUDE });
    if (!row) throw AppException.notFound('Goal not found');
    return row;
  }
}
