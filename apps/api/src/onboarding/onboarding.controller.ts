import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  onboardingSchema,
  onboardingStepSchema,
  updateOnboardingStepRequestSchema,
  type Onboarding,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { OnboardingService } from './onboarding.service';

class OnboardingDto extends createZodDto(onboardingSchema) {}
class StepParamDto extends createZodDto(z.object({ step: onboardingStepSchema })) {}
class UpdateStepDto extends createZodDto(updateOnboardingStepRequestSchema) {}

/** AUTH-05 and AUTH-11 (ADR 0035). */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ZodSerializerDto(OnboardingDto)
  get(@CurrentUser() user: AuthUser): Promise<Onboarding> {
    return this.onboarding.get(user.id);
  }

  @Patch('steps/:step')
  @ZodSerializerDto(OnboardingDto)
  markStep(
    @CurrentUser() user: AuthUser,
    @Param() params: StepParamDto,
    @Body() body: UpdateStepDto,
  ): Promise<Onboarding> {
    return this.onboarding.markStep(user.id, params.step, body);
  }

  @Post('dismiss')
  @HttpCode(200)
  @ZodSerializerDto(OnboardingDto)
  dismiss(@CurrentUser() user: AuthUser): Promise<Onboarding> {
    return this.onboarding.dismiss(user.id);
  }
}
