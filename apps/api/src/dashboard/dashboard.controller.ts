import { Controller, Get, Query } from '@nestjs/common';
import { dashboardQuerySchema, dashboardSchema, type Dashboard } from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

class DashboardQueryDto extends createZodDto(dashboardQuerySchema) {}
class DashboardDto extends createZodDto(dashboardSchema) {}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ZodSerializerDto(DashboardDto)
  get(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto): Promise<Dashboard> {
    return this.dashboard.get(user.id, query.period);
  }
}
