import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  adminPlanRequestSchema,
  adminPlanRequestsQuerySchema,
  adminPlanSchema,
  adminUserDetailSchema,
  assignPlanRequestSchema,
  createPlanRequestSchema,
  idParamSchema,
  updatePlanRequestSchema,
  type AdminPlan,
  type AdminPlanRequest,
  type AdminUserDetail,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AdminOnly } from '../common/admin.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AdminPlansService } from '../plans/admin-plans.service';
import { AdminUsersService } from './admin-users.service';

class IdParamDto extends createZodDto(idParamSchema) {}
class AdminPlanDto extends createZodDto(adminPlanSchema) {}
class CreatePlanDto extends createZodDto(createPlanRequestSchema) {}
class UpdatePlanDto extends createZodDto(updatePlanRequestSchema) {}
class AssignPlanDto extends createZodDto(assignPlanRequestSchema) {}
class UserDetailDto extends createZodDto(adminUserDetailSchema) {}
class PlanRequestsQueryDto extends createZodDto(adminPlanRequestsQuerySchema) {}
class AdminPlanRequestDto extends createZodDto(adminPlanRequestSchema) {}

/** Plans, plan changes and requests (PLN-01, 02, 06 and ADM-06). */
@AdminOnly()
@Controller('admin')
export class AdminPlansController {
  constructor(
    private readonly plans: AdminPlansService,
    private readonly users: AdminUsersService,
  ) {}

  @Get('plans')
  @ZodSerializerDto([AdminPlanDto])
  list(): Promise<AdminPlan[]> {
    return this.plans.list();
  }

  @Post('plans')
  @ZodSerializerDto(AdminPlanDto)
  create(@CurrentUser() admin: AuthUser, @Body() body: CreatePlanDto): Promise<AdminPlan> {
    return this.plans.create(admin.id, body);
  }

  @Patch('plans/:id')
  @ZodSerializerDto(AdminPlanDto)
  update(
    @CurrentUser() admin: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdatePlanDto,
  ): Promise<AdminPlan> {
    return this.plans.update(admin.id, params.id, body);
  }

  @Post('users/:id/plan')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(UserDetailDto)
  async assign(
    @CurrentUser() admin: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: AssignPlanDto,
  ): Promise<AdminUserDetail> {
    await this.plans.assign(admin.id, params.id, body.planId, body.lastDay ?? null);
    return this.users.detail(params.id);
  }

  @Get('plan-requests')
  @ZodSerializerDto([AdminPlanRequestDto])
  requests(@Query() query: PlanRequestsQueryDto): Promise<AdminPlanRequest[]> {
    return this.plans.requests(query.status);
  }

  @Post('plan-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AdminPlanRequestDto)
  approve(@CurrentUser() admin: AuthUser, @Param() params: IdParamDto): Promise<AdminPlanRequest> {
    return this.plans.decide(admin.id, params.id, true);
  }

  @Post('plan-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AdminPlanRequestDto)
  reject(@CurrentUser() admin: AuthUser, @Param() params: IdParamDto): Promise<AdminPlanRequest> {
    return this.plans.decide(admin.id, params.id, false);
  }
}
