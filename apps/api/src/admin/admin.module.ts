import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PlansModule } from '../plans/plans.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminUsersService } from './admin-users.service';
import { AdminPlansController } from './admin-plans.controller';
import { AdminController } from './admin.controller';

/**
 * Administration. Imports only platform modules (settings, audit, plans), never the financial ones:
 * it reads users and counts, not money.
 */
@Module({
  imports: [AuditModule, SettingsModule, PlansModule],
  controllers: [AdminController, AdminPlansController],
  providers: [AdminMetricsService, AdminUsersService],
})
export class AdminModule {}
