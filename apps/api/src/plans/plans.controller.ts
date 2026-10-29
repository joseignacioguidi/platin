import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createPlanChangeRequestSchema,
  myPlanSchema,
  planRequestSchema,
  publicPlanSchema,
  type MyPlan,
  type PlanRequestDto,
  type PublicPlan,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { PlansService } from './plans.service';

class PublicPlanDto extends createZodDto(publicPlanSchema) {}
class MyPlanDto extends createZodDto(myPlanSchema) {}
class PlanRequestDtoClass extends createZodDto(planRequestSchema) {}
class CreatePlanChangeDto extends createZodDto(createPlanChangeRequestSchema) {}

@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** The public plans page (no sign-in). */
  @Public()
  @Get('plans')
  @ZodSerializerDto([PublicPlanDto])
  list(): Promise<PublicPlan[]> {
    return this.plans.listPublic();
  }

  @Get('me/plan')
  @ZodSerializerDto(MyPlanDto)
  mine(@CurrentUser() user: AuthUser): Promise<MyPlan> {
    return this.plans.myPlan(user.id);
  }

  @Post('plan-requests')
  @ZodSerializerDto(PlanRequestDtoClass)
  request(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePlanChangeDto,
  ): Promise<PlanRequestDto> {
    return this.plans.requestChange(user.id, body.planId, body.message);
  }
}
