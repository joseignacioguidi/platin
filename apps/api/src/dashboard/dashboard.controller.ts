import { Controller, Get, Query } from '@nestjs/common';
import {
  dashboardPeriodQuerySchema,
  dashboardQuerySchema,
  dashboardSchema,
  monthIncomeSchema,
  monthSummarySchema,
  type Dashboard,
  type MonthIncome,
  type MonthSummary,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

class DashboardQueryDto extends createZodDto(dashboardQuerySchema) {}
class DashboardPeriodQueryDto extends createZodDto(dashboardPeriodQuerySchema) {}
class DashboardDto extends createZodDto(dashboardSchema) {}
class MonthSummaryDto extends createZodDto(monthSummarySchema) {}
class MonthIncomeDto extends createZodDto(monthIncomeSchema) {}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ZodSerializerDto(DashboardDto)
  get(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto): Promise<Dashboard> {
    return this.dashboard.get(user.id, query.period);
  }

  /** DAS-05: the month summary sheet ("Libre"). */
  @Get('summary')
  @ZodSerializerDto(MonthSummaryDto)
  summary(
    @CurrentUser() user: AuthUser,
    @Query() query: DashboardPeriodQueryDto,
  ): Promise<MonthSummary> {
    return this.dashboard.summary(user.id, query.period);
  }

  /** DAS-05: the "Ingresos del mes" sheet. */
  @Get('income')
  @ZodSerializerDto(MonthIncomeDto)
  income(
    @CurrentUser() user: AuthUser,
    @Query() query: DashboardPeriodQueryDto,
  ): Promise<MonthIncome> {
    return this.dashboard.income(user.id, query.period);
  }
}
