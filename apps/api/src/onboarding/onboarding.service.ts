import { Injectable } from '@nestjs/common';
import type {
  Onboarding,
  OnboardingStepName,
  UpdateOnboardingStepRequest,
} from '@platin/contracts';
import {
  limitOf,
  markOnboardingStep,
  missingOnboardingSteps,
  onboardingProgress,
  type OnboardingState,
} from '@platin/domain';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { readOnboarding, updateOnboarding } from './onboarding-state';

/**
 * AUTH-05 and AUTH-11. Only the state lives here: what the steps create goes through the usual
 * endpoints (accounts, cards, charges, fixed items).
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly clock: ClockService,
  ) {}

  async get(userId: string): Promise<Onboarding> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppException.notFound('User not found');
    return this.toDto(userId, readOnboarding(user.preferences));
  }

  async markStep(
    userId: string,
    step: OnboardingStepName,
    request: UpdateOnboardingStepRequest,
  ): Promise<Onboarding> {
    const state = await this.prisma.$transaction((tx) =>
      updateOnboarding(tx, userId, (current) => markOnboardingStep(current, step, request.status)),
    );
    return this.toDto(userId, state);
  }

  /** "Ahora no": hides the home card until the next sign-in. */
  async dismiss(userId: string): Promise<Onboarding> {
    const at = this.clock.now().toISOString();
    const state = await this.prisma.$transaction((tx) =>
      updateOnboarding(tx, userId, (current) =>
        current.status === 'DONE' ? current : { ...current, dismissedAt: at },
      ),
    );
    return this.toDto(userId, state);
  }

  private async toDto(userId: string, state: OnboardingState): Promise<Onboarding> {
    const [{ limits }, accounts, cards, fixed] = await Promise.all([
      this.plans.current(userId),
      this.plans.used(userId, 'accounts'),
      this.plans.used(userId, 'cards'),
      this.plans.used(userId, 'fixed'),
    ]);
    return {
      status: state.status,
      steps: state.steps,
      dismissedAt: state.dismissedAt ?? null,
      progress: onboardingProgress(state),
      missing: missingOnboardingSteps(state),
      limits: {
        accounts: { max: limitOf(limits, 'accounts'), used: accounts },
        cards: { max: limitOf(limits, 'cards'), used: cards },
        fixed: { max: limitOf(limits, 'fixed'), used: fixed },
      },
    };
  }
}
