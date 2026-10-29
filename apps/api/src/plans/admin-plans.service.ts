import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AdminPlan,
  AdminPlanRequest,
  CreatePlanRequest,
  UpdatePlanRequest,
} from '@platin/contracts';
import { addDays, startOfDayIn, type LocalDate } from '@platin/domain';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { Prisma, type Plan } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService, toPlanRequestDto, toPublicPlan } from './plans.service';

/** PLN-01/02/06 and ADM-06: plans, assignments and requests, every change audited. */
@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async list(): Promise<AdminPlan[]> {
    const [plans, users] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.user.findMany({ select: { id: true } }),
    ]);
    const counts = await this.usersByPlan(users.map((user) => user.id));
    return plans.map((plan) => this.toAdminPlan(plan, counts.get(plan.id) ?? 0));
  }

  /** How many users have each plan in force right now. */
  async usersByPlan(userIds: string[]): Promise<Map<string, number>> {
    const current = await this.plans.currentFor(userIds);
    const counts = new Map<string, number>();
    for (const { plan } of current.values()) counts.set(plan.id, (counts.get(plan.id) ?? 0) + 1);
    return counts;
  }

  async create(actorId: string, request: CreatePlanRequest): Promise<AdminPlan> {
    try {
      const plan = await this.prisma.$transaction(async (tx) => {
        const created = await tx.plan.create({
          data: {
            key: request.key,
            name: request.name,
            description: request.description ?? '',
            priceArs: request.priceArs ?? null,
            limits: request.limits,
            isPublic: request.isPublic ?? true,
            sortOrder: request.sortOrder ?? 0,
          },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'plan.create',
          payload: { planId: created.id, planName: created.name, after: toPublicPlan(created) },
        });
        return created;
      });
      return this.toAdminPlan(plan, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          'PLAN_KEY_TAKEN',
          HttpStatus.CONFLICT,
          'There is already a plan with that key',
        );
      }
      throw error;
    }
  }

  async update(actorId: string, id: string, changes: UpdatePlanRequest): Promise<AdminPlan> {
    const before = await this.find(id);
    if (changes.archived && (before.isDefault || changes.isDefault)) {
      throw new AppException(
        'PLAN_IS_DEFAULT',
        HttpStatus.CONFLICT,
        'The default plan cannot be archived',
      );
    }
    if (changes.isDefault && before.archivedAt && changes.archived !== false) {
      throw new AppException(
        'PLAN_ARCHIVED',
        HttpStatus.CONFLICT,
        'An archived plan cannot be the default',
      );
    }
    const plan = await this.prisma.$transaction(async (tx) => {
      if (changes.isDefault && !before.isDefault) {
        await tx.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      const updated = await tx.plan.update({
        where: { id },
        data: {
          name: changes.name,
          description: changes.description,
          priceArs: changes.priceArs === undefined ? undefined : changes.priceArs,
          limits: changes.limits,
          isPublic: changes.isPublic,
          sortOrder: changes.sortOrder,
          isDefault: changes.isDefault,
          archivedAt:
            changes.archived === undefined
              ? undefined
              : changes.archived
                ? (before.archivedAt ?? this.clock.now())
                : null,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action: 'plan.update',
        payload: {
          planId: id,
          planName: updated.name,
          before: {
            ...toPublicPlan(before),
            isPublic: before.isPublic,
            archived: !!before.archivedAt,
          },
          after: {
            ...toPublicPlan(updated),
            isPublic: updated.isPublic,
            archived: !!updated.archivedAt,
          },
        },
      });
      return updated;
    });
    const counts = await this.usersByPlan([
      ...(await this.prisma.user.findMany({ select: { id: true } })).map((user) => user.id),
    ]);
    return this.toAdminPlan(plan, counts.get(plan.id) ?? 0);
  }

  /** PLN-06: from now on, optionally until the end of `lastDay` (Buenos Aires). */
  async assign(
    actorId: string,
    userId: string,
    planId: string,
    lastDay: LocalDate | null,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw AppException.notFound('User not found');
    const plan = await this.find(planId);
    if (plan.archivedAt) {
      throw new AppException('PLAN_ARCHIVED', HttpStatus.CONFLICT, 'The plan is archived');
    }
    if (lastDay && lastDay < this.clock.today()) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'The last day is in the past',
        [{ path: 'lastDay', message: 'La fecha tiene que ser hoy o posterior' }],
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await this.plans.current(userId, tx);
      await this.grant(tx, actorId, userId, plan, 'ADMIN', lastDay);
      await this.audit.record(tx, {
        actorId,
        action: 'user.plan',
        targetUserId: userId,
        payload: { before: { plan: before.plan.name }, after: { plan: plan.name, lastDay } },
      });
    });
  }

  async requests(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<AdminPlanRequest[]> {
    const rows = await this.prisma.planRequest.findMany({
      where: status ? { status } : {},
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const [users, current] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      }),
      this.plans.currentFor(userIds),
    ]);
    const emails = new Map(users.map((user) => [user.id, user.email]));
    return rows.map((row) => ({
      ...toPlanRequestDto(row),
      userId: row.userId,
      userEmail: emails.get(row.userId) ?? null,
      currentPlanName: current.get(row.userId)?.plan.name ?? null,
    }));
  }

  /** ADM-06: approving grants the requested plan with no expiry. */
  async decide(actorId: string, requestId: string, approve: boolean): Promise<AdminPlanRequest> {
    const request = await this.prisma.planRequest.findUnique({
      where: { id: requestId },
      include: { plan: true },
    });
    if (!request) throw AppException.notFound('Request not found');
    if (request.status !== 'PENDING') {
      throw new AppException(
        'PLAN_REQUEST_DECIDED',
        HttpStatus.CONFLICT,
        'The request was already decided',
      );
    }
    if (approve && request.plan.archivedAt) {
      throw new AppException('PLAN_ARCHIVED', HttpStatus.CONFLICT, 'The plan is archived');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.planRequest.update({
        where: { id: requestId },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          decidedBy: actorId,
          decidedAt: this.clock.now(),
        },
      });
      if (approve) await this.grant(tx, actorId, request.userId, request.plan, 'REQUEST', null);
      await this.audit.record(tx, {
        actorId,
        action: approve ? 'plan-request.approve' : 'plan-request.reject',
        targetUserId: request.userId,
        payload: { requestId, plan: request.plan.name },
      });
    });
    const [decided] = (await this.requests()).filter((row) => row.id === requestId);
    return decided;
  }

  private async grant(
    tx: Prisma.TransactionClient,
    actorId: string,
    userId: string,
    plan: Plan,
    source: 'ADMIN' | 'REQUEST',
    lastDay: LocalDate | null,
  ): Promise<void> {
    await tx.userPlan.create({
      data: {
        userId,
        planId: plan.id,
        source,
        startsAt: this.clock.now(),
        endsAt: lastDay ? startOfDayIn(addDays(lastDay, 1)) : null,
        grantedBy: actorId,
      },
    });
  }

  private async find(id: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw AppException.notFound('Plan not found');
    return plan;
  }

  private toAdminPlan(plan: Plan, userCount: number): AdminPlan {
    return {
      ...toPublicPlan(plan),
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
      archived: plan.archivedAt !== null,
      userCount,
    };
  }
}
