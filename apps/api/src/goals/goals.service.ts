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
  canConvert,
  convert,
  RateTable,
  sumByCurrency,
} from '@platin/domain';
import { PocketBalancesService } from '../accounts/pocket-balances.service';
import { AppException } from '../common/app-exception';
import { CurrenciesService } from '../common/currencies.service';
import { ClockService } from '../common/clock.service';
import { money, toDbPeriod } from '../common/serialize';
import type { Prisma } from '../generated/prisma/client';
import { EntitlementsService } from '../plans/entitlements.service';
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
    private readonly entitlements: EntitlementsService,
    private readonly currencies: CurrenciesService,
  ) {}

  async list(userId: string): Promise<Goal[]> {
    const rows = await this.prisma.goal.findMany({
      where: { userId },
      include: GOAL_INCLUDE,
      orderBy: [{ status: 'asc' }, { targetPeriod: 'asc' }],
    });
    const rate = await this.todayRates(userId);
    return Promise.all(rows.map((row) => this.toDto(userId, row, rate.table)));
  }

  async get(userId: string, id: string, monthly?: string): Promise<Goal> {
    return this.toDto(
      userId,
      await this.getOwned(userId, id),
      (await this.todayRates(userId)).table,
      monthly,
    );
  }

  /** MET-04: "if I save X per month, when do I get there?". */
  async projection(userId: string, id: string, monthly: string): Promise<GoalProjection> {
    return (await this.get(userId, id, monthly)).projection;
  }

  async create(userId: string, request: CreateGoalRequest): Promise<Goal> {
    await this.currencies.assertEnabled(userId, request.currency);
    await this.assertPockets(userId, request.pocketIds ?? []);
    const row = await this.entitlements.withinLimits(userId, { goals: 1 }, (tx) =>
      tx.goal.create({
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
      }),
    );
    return this.toDto(userId, row, (await this.todayRates(userId)).table);
  }

  async update(userId: string, id: string, changes: UpdateGoalRequest): Promise<Goal> {
    const row = await this.getOwned(userId, id);
    if (changes.pocketIds) await this.assertPockets(userId, changes.pocketIds);
    // Only active goals count: reactivating an achieved or cancelled one counts again (SEC-F05).
    const needs = changes.status === 'ACTIVE' && row.status !== 'ACTIVE' ? { goals: 1 } : {};
    if (needs.goals) await this.currencies.assertEnabled(userId, row.currency);
    await this.entitlements.withinLimits(userId, needs, async (tx) => {
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
   * Total saved, valued in USD (dollar of the preferred type, the other currencies at the
   * oficial rate): the savings and investment pockets that count for net worth, in any currency.
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
    const rate = await this.todayRates(userId);
    const byCurrency = sumByCurrency(
      pockets.map((p) => balances.get(p.id) ?? Money.zero(p.currency)),
    );
    // Without a rate for a currency, it can't be valued: it counts as zero in the totals.
    const valueIn = (money: Money, to: Currency) =>
      canConvert(money.currency, to, rate.table) ? convert(money, to, rate.table) : Money.zero(to);
    const lines = byCurrency
      .map((money) => ({ money, usd: valueIn(money, 'USD') }))
      .sort((a, b) => b.usd.amount.comparedTo(a.usd.amount));
    return {
      rate: rate.dollar ? { type: rate.dollar.type, sell: rate.dollar.sell } : null,
      totalUsd: Money.sum(
        lines.map((line) => line.usd),
        'USD',
      ).toString(),
      totalArs: Money.sum(
        byCurrency.map((money) => valueIn(money, 'ARS')),
        'ARS',
      ).toString(),
      byCurrency: lines.map((line) => ({
        currency: line.money.currency,
        amount: line.money.toString(),
        valueUsd: line.usd.toString(),
      })),
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
    rates: RateTable,
    monthly?: string,
  ): Promise<Goal> {
    const balances = await this.balances.balances(
      userId,
      row.pockets.map((link) => link.pocket),
    );
    // A pocket in a currency without a known rate can't add to the goal yet.
    const toGoal = (m: Money) =>
      canConvert(m.currency, row.currency, rates)
        ? convert(m, row.currency, rates)
        : Money.zero(row.currency);
    const pockets = row.pockets.map(({ pocket }) => {
      const balance = balances.get(pocket.id) ?? Money.zero(pocket.currency);
      return { pocket, balance, converted: toGoal(balance) };
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

  /** The dollar of the preferred type and the table of every currency, for today. */
  private async todayRates(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const today = this.clock.today();
    const [dollar, table] = await Promise.all([
      this.rates.rateFor(user.valuationRate, today),
      this.rates.tableFor(user.valuationRate, today),
    ]);
    return { dollar, table };
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
