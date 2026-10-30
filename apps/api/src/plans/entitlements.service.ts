import { HttpStatus, Injectable } from '@nestjs/common';
import { checkLimit, hasFeature, type LimitedResource, type PlanFeature } from '@platin/domain';
import { AppException } from '../common/app-exception';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from './plans.service';

/** How many records of each limited resource a write adds to the count. */
export type LimitNeeds = Partial<Record<LimitedResource, number>>;

/**
 * The one place that enforces plans. Limits are checked when creating and when something
 * starts counting again (restore, resume, reactivate), PLN-05: over the limit the user keeps
 * viewing, editing, archiving and deleting what they have.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly plans: PlansService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Runs `write` in a transaction that first locks the user's row and then checks there is room
   * for `needs`. The lock serializes a user's limited writes, so parallel requests at the limit
   * cannot all pass the check (SEC-F06).
   */
  withinLimits<T>(
    userId: string,
    needs: LimitNeeds,
    write: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      for (const [resource, adding] of Object.entries(needs) as [LimitedResource, number][]) {
        if (adding > 0) await this.assertCanCreate(userId, resource, tx, adding);
      }
      return write(tx);
    });
  }

  async assertCanCreate(
    userId: string,
    resource: LimitedResource,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    adding = 1,
  ): Promise<void> {
    const { plan, limits } = await this.plans.current(userId, client);
    const used = await this.plans.used(userId, resource, client);
    const check = checkLimit(limits, resource, used, adding);
    if (!check.allowed) {
      throw new AppException(
        'PLAN_LIMIT_REACHED',
        HttpStatus.FORBIDDEN,
        `The ${plan.name} plan allows ${check.limit} ${resource}`,
        undefined,
        { resource, limit: check.limit, used: check.used, plan: plan.name },
      );
    }
  }

  async assertFeature(userId: string, feature: PlanFeature): Promise<void> {
    const { plan, limits } = await this.plans.current(userId);
    if (!hasFeature(limits, feature)) {
      throw new AppException(
        'FEATURE_NOT_IN_PLAN',
        HttpStatus.FORBIDDEN,
        `The ${plan.name} plan does not include ${feature}`,
        undefined,
        { resource: feature, limit: null, used: 0, plan: plan.name },
      );
    }
  }
}
