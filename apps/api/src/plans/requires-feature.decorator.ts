import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlanFeature } from '@platin/domain';
import { AuthenticatedRequest } from '../common/current-user.decorator';
import { EntitlementsService } from './entitlements.service';

const FEATURE = 'platin:feature';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const userId = context.switchToHttp().getRequest<AuthenticatedRequest>().user?.id;
    if (feature && userId) await this.entitlements.assertFeature(userId, feature);
    return true;
  }
}

/** The endpoint needs a feature of the plan; otherwise 403 FEATURE_NOT_IN_PLAN. */
export const RequiresFeature = (feature: PlanFeature) =>
  applyDecorators(SetMetadata(FEATURE, feature), UseGuards(FeatureGuard));
