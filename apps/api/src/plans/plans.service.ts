import { HttpStatus, Injectable } from '@nestjs/common';
import {
  planLimitsSchema,
  type MyPlan,
  type PlanRequestDto,
  type PlanUsage,
  type PublicPlan,
} from '@platin/contracts';
import { resolveCurrentPlan, type LimitedResource, type PlanLimits } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import type { Plan, PlanRequest, Prisma, UserPlan } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = Prisma.TransactionClient | PrismaService;

export interface CurrentPlan {
  plan: Plan;
  limits: PlanLimits;
  /** The assignment in force; `null` when the user falls back to the default plan. */
  assignment: UserPlan | null;
}

export function limitsOf(plan: Plan): PlanLimits {
  return planLimitsSchema.parse(plan.limits);
}

export function toPublicPlan(plan: Plan): PublicPlan {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    priceArs: plan.priceArs?.toFixed(2) ?? null,
    limits: limitsOf(plan),
    isDefault: plan.isDefault,
  };
}

export function toPlanRequestDto(request: PlanRequest & { plan: Plan }): PlanRequestDto {
  return {
    id: request.id,
    planId: request.planId,
    planName: request.plan.name,
    message: request.message,
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
  };
}

/** PLN-02/03/04: which plan each user has, what it allows and how much of it is used. */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async defaultPlan(client: Client = this.prisma): Promise<Plan> {
    const plan = await client.plan.findFirst({ where: { isDefault: true } });
    if (!plan) throw new Error('There is no default plan (see the plans migration)');
    return plan;
  }

  /** Public plans, in order (GET /plans). */
  async listPublic(): Promise<PublicPlan[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isPublic: true, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return plans.map(toPublicPlan);
  }

  async current(userId: string, client: Client = this.prisma): Promise<CurrentPlan> {
    return (await this.currentFor([userId], client)).get(userId) as CurrentPlan;
  }

  /** The plan in force of several users at once (admin lists and metrics). */
  async currentFor(
    userIds: string[],
    client: Client = this.prisma,
  ): Promise<Map<string, CurrentPlan>> {
    const now = this.clock.now();
    const fallback = await this.defaultPlan(client);
    const rows = await client.userPlan.findMany({
      where: {
        userId: { in: userIds },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: { plan: true },
    });
    const byUser = new Map<string, (UserPlan & { plan: Plan })[]>();
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

    const result = new Map<string, CurrentPlan>();
    for (const userId of userIds) {
      const { current } = resolveCurrentPlan(byUser.get(userId) ?? [], fallback.id, now);
      const plan = current?.plan ?? fallback;
      result.set(userId, { plan, limits: limitsOf(plan), assignment: current });
    }
    return result;
  }

  /** Active records of each limited resource; archived, paused or closed ones don't count. */
  async usage(userId: string, client: Client = this.prisma): Promise<PlanUsage> {
    const [accounts, pockets, cards, goals, fixed] = await Promise.all(
      (['accounts', 'pockets', 'cards', 'goals', 'fixed'] as const).map((resource) =>
        this.used(userId, resource, client),
      ),
    );
    return { accounts, pockets, cards, goals, fixed };
  }

  used(userId: string, resource: LimitedResource, client: Client = this.prisma): Promise<number> {
    switch (resource) {
      case 'accounts':
        return client.account.count({ where: { userId, archivedAt: null } });
      case 'pockets':
        // The "Disponible" of each account comes with it: only the pockets the user adds count.
        return client.pocket.count({
          where: { userId, archivedAt: null, kind: { not: 'AVAILABLE' } },
        });
      case 'cards':
        return client.creditCard.count({ where: { userId, archivedAt: null } });
      case 'goals':
        return client.goal.count({ where: { userId, status: 'ACTIVE' } });
      case 'fixed':
        return client.fixedItem.count({ where: { userId, pausedAt: null } });
    }
  }

  async myPlan(userId: string): Promise<MyPlan> {
    const [current, usage, pending] = await Promise.all([
      this.current(userId),
      this.usage(userId),
      this.prisma.planRequest.findFirst({
        where: { userId, status: 'PENDING' },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      plan: toPublicPlan(current.plan),
      source: current.assignment?.source ?? 'DEFAULT',
      endsAt: current.assignment?.endsAt?.toISOString() ?? null,
      usage,
      pendingRequest: pending ? toPlanRequestDto(pending) : null,
    };
  }

  /** PLN-04: asks the admin for another plan. One pending request at a time. */
  async requestChange(userId: string, planId: string, message?: string): Promise<PlanRequestDto> {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, archivedAt: null, isPublic: true },
    });
    if (!plan) throw AppException.notFound('Plan not found');
    const current = await this.current(userId);
    if (current.plan.id === planId) {
      throw new AppException(
        'PLAN_ALREADY_ACTIVE',
        HttpStatus.CONFLICT,
        'That is already your plan',
      );
    }
    const pending = await this.prisma.planRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      throw new AppException(
        'PLAN_REQUEST_PENDING',
        HttpStatus.CONFLICT,
        'There is already a pending request',
      );
    }
    const request = await this.prisma.planRequest.create({
      data: { userId, planId, message: message || null },
      include: { plan: true },
    });
    return toPlanRequestDto(request);
  }
}
