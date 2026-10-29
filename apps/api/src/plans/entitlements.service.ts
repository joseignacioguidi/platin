import { HttpStatus, Injectable } from '@nestjs/common';
import { checkLimit, hasFeature, type LimitedResource, type PlanFeature } from '@platin/domain';
import { AppException } from '../common/app-exception';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlansService } from './plans.service';

/**
 * The one place that enforces plans. Limits are checked only when creating (PLN-05): over the
 * limit the user keeps viewing, editing, archiving and deleting what they have.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly plans: PlansService,
    private readonly prisma: PrismaService,
  ) {}

  async assertCanCreate(
    userId: string,
    resource: LimitedResource,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const { plan, limits } = await this.plans.current(userId, client);
    const check = checkLimit(limits, resource, await this.plans.used(userId, resource, client));
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
