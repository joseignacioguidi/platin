import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminPlansService } from './admin-plans.service';
import { EntitlementsService } from './entitlements.service';
import { FeatureGuard } from './requires-feature.decorator';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

/**
 * Plans and their limits (PLN-01 to 06). Global: every module that creates a limited resource
 * asks EntitlementsService first. Billing will plug in here later.
 */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [PlansController],
  providers: [PlansService, EntitlementsService, AdminPlansService, FeatureGuard],
  exports: [PlansService, EntitlementsService, AdminPlansService, FeatureGuard],
})
export class PlansModule {}
