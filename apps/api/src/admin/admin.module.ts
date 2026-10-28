import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

/**
 * Administration. Imports only platform modules (settings, audit), never the financial ones:
 * it reads users and counts, not money.
 */
@Module({
  imports: [AuditModule, SettingsModule],
  controllers: [AdminController],
  providers: [AdminMetricsService, AdminUsersService],
})
export class AdminModule {}
