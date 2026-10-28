import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  adminMetricsSchema,
  adminUserDetailSchema,
  adminUsersPageSchema,
  adminUsersQuerySchema,
  auditPageSchema,
  auditQuerySchema,
  deleteUserRequestSchema,
  idParamSchema,
  settingKeyParamSchema,
  settingSchema,
  updateSettingRequestSchema,
  type AdminMetrics,
  type AdminUserDetail,
  type AdminUsersPage,
  type AuditPage,
  type Setting,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuditService } from '../audit/audit.service';
import { AdminOnly } from '../common/admin.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { SettingsService } from '../settings/settings.service';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminUsersService } from './admin-users.service';

class IdParamDto extends createZodDto(idParamSchema) {}
class MetricsDto extends createZodDto(adminMetricsSchema) {}
class UsersQueryDto extends createZodDto(adminUsersQuerySchema) {}
class UsersPageDto extends createZodDto(adminUsersPageSchema) {}
class UserDetailDto extends createZodDto(adminUserDetailSchema) {}
class DeleteUserDto extends createZodDto(deleteUserRequestSchema) {}
class SettingKeyDto extends createZodDto(settingKeyParamSchema) {}
class SettingDto extends createZodDto(settingSchema) {}
class UpdateSettingDto extends createZodDto(updateSettingRequestSchema) {}
class AuditQueryDto extends createZodDto(auditQuerySchema) {}
class AuditPageDto extends createZodDto(auditPageSchema) {}

/** Platform administration (ADM-01 to 05 and 07). Never returns a user's financial data. */
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly users: AdminUsersService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get('metrics')
  @ZodSerializerDto(MetricsDto)
  getMetrics(): Promise<AdminMetrics> {
    return this.metrics.metrics();
  }

  @Get('users')
  @ZodSerializerDto(UsersPageDto)
  listUsers(@Query() query: UsersQueryDto): Promise<AdminUsersPage> {
    return this.users.list(query);
  }

  @Get('users/:id')
  @ZodSerializerDto(UserDetailDto)
  getUser(@Param() params: IdParamDto): Promise<AdminUserDetail> {
    return this.users.detail(params.id);
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(UserDetailDto)
  suspend(@CurrentUser() admin: AuthUser, @Param() params: IdParamDto): Promise<AdminUserDetail> {
    return this.users.setStatus(admin.id, params.id, 'SUSPENDED');
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(UserDetailDto)
  reactivate(
    @CurrentUser() admin: AuthUser,
    @Param() params: IdParamDto,
  ): Promise<AdminUserDetail> {
    return this.users.setStatus(admin.id, params.id, 'ACTIVE');
  }

  @Post('users/:id/logout')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(UserDetailDto)
  logout(@CurrentUser() admin: AuthUser, @Param() params: IdParamDto): Promise<AdminUserDetail> {
    return this.users.logout(admin.id, params.id);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(
    @CurrentUser() admin: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: DeleteUserDto,
  ): Promise<void> {
    return this.users.delete(admin.id, params.id, body.confirmEmail);
  }

  @Get('settings/:key')
  @ZodSerializerDto(SettingDto)
  getSetting(@Param() params: SettingKeyDto): Promise<Setting> {
    return this.settings.get(params.key);
  }

  @Put('settings/:key')
  @ZodSerializerDto(SettingDto)
  updateSetting(
    @CurrentUser() admin: AuthUser,
    @Param() params: SettingKeyDto,
    @Body() body: UpdateSettingDto,
  ): Promise<Setting> {
    return this.settings.update(params.key, body.value, admin.id);
  }

  @Get('audit')
  @ZodSerializerDto(AuditPageDto)
  listAudit(@Query() query: AuditQueryDto): Promise<AuditPage> {
    return this.audit.list(query);
  }
}
