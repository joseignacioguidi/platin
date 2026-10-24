import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createContributionRequestSchema,
  createGoalRequestSchema,
  goalProjectionQuerySchema,
  goalProjectionSchema,
  goalSchema,
  idParamSchema,
  savingsSchema,
  updateGoalRequestSchema,
  type Goal,
  type GoalProjection,
  type Savings,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { GoalsService } from './goals.service';

class GoalDto extends createZodDto(goalSchema) {}
class CreateGoalDto extends createZodDto(createGoalRequestSchema) {}
class UpdateGoalDto extends createZodDto(updateGoalRequestSchema) {}
class ContributionDto extends createZodDto(createContributionRequestSchema) {}
class ProjectionQueryDto extends createZodDto(goalProjectionQuerySchema) {}
class ProjectionDto extends createZodDto(goalProjectionSchema) {}
class SavingsDto extends createZodDto(savingsSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ZodSerializerDto([GoalDto])
  list(@CurrentUser() user: AuthUser): Promise<Goal[]> {
    return this.goals.list(user.id);
  }

  @Post()
  @ZodSerializerDto(GoalDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateGoalDto): Promise<Goal> {
    return this.goals.create(user.id, body);
  }

  @Get(':id')
  @ZodSerializerDto(GoalDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Goal> {
    return this.goals.get(user.id, params.id);
  }

  @Patch(':id')
  @ZodSerializerDto(GoalDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateGoalDto,
  ): Promise<Goal> {
    return this.goals.update(user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.goals.remove(user.id, params.id);
  }

  @Post(':id/contributions')
  @ZodSerializerDto(GoalDto)
  contribute(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: ContributionDto,
  ): Promise<Goal> {
    return this.goals.addContribution(user.id, params.id, body);
  }

  @Get(':id/projection')
  @ZodSerializerDto(ProjectionDto)
  projection(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Query() query: ProjectionQueryDto,
  ): Promise<GoalProjection> {
    return this.goals.projection(user.id, params.id, query.monthly);
  }
}

@Controller('savings')
export class SavingsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ZodSerializerDto(SavingsDto)
  get(@CurrentUser() user: AuthUser): Promise<Savings> {
    return this.goals.savings(user.id);
  }
}
