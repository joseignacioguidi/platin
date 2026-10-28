import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnnouncementsController } from './announcements.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuditModule],
  controllers: [AnnouncementsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
