import { Injectable } from '@nestjs/common';
import type { AdminMetrics } from '@platin/contracts';
import { addDays, countByWeek, localDateAt, localDateToUtc, weekStart } from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { PrismaService } from '../prisma/prisma.service';

const SIGNUP_WEEKS = 12;

/** ADM-02: aggregated counts only, never per-user content. */
@Injectable()
export class AdminMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async metrics(): Promise<AdminMetrics> {
    const today = this.clock.today();
    const firstWeek = addDays(weekStart(today), -7 * (SIGNUP_WEEKS - 1));
    // One day earlier: Buenos Aires midnight is 03:00 UTC; countByWeek drops older dates.
    const since = localDateToUtc(addDays(firstWeek, -1));

    const [
      totalUsers,
      suspendedUsers,
      active7,
      active30,
      signups,
      cards,
      goals,
      fixed,
      investments,
      savings,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.activeSince(addDays(today, -6)),
      this.activeSince(addDays(today, -29)),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.creditCard.groupBy({ by: ['userId'], where: { archivedAt: null } }),
      this.prisma.goal.groupBy({ by: ['userId'], where: { status: 'ACTIVE' } }),
      this.prisma.fixedItem.groupBy({ by: ['userId'], where: { pausedAt: null } }),
      this.prisma.pocket.groupBy({
        by: ['userId'],
        where: { kind: 'INVESTMENT', archivedAt: null },
      }),
      this.prisma.pocket.groupBy({ by: ['userId'], where: { kind: 'SAVINGS', archivedAt: null } }),
    ]);

    return {
      totalUsers,
      suspendedUsers,
      activeLast7Days: active7,
      activeLast30Days: active30,
      signupsByWeek: countByWeek(
        signups.map((user) => localDateAt(user.createdAt)),
        today,
        SIGNUP_WEEKS,
      ),
      featureUsage: {
        cards: cards.length,
        goals: goals.length,
        fixed: fixed.length,
        investments: investments.length,
        savingsPockets: savings.length,
      },
    };
  }

  private async activeSince(from: ReturnType<typeof addDays>): Promise<number> {
    const users = await this.prisma.activityDay.groupBy({
      by: ['userId'],
      where: { date: { gte: localDateToUtc(from) } },
    });
    return users.length;
  }
}
