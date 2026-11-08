import { Injectable } from '@nestjs/common';
import { initialOnboardingState } from '@platin/domain';
import { seedSuggestedCategories } from '../categories/suggested-categories';
import type { Prisma } from '../generated/prisma/client';
import { writeOnboarding } from '../onboarding/onboarding-state';
import { PlansService } from '../plans/plans.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Data every new user starts with (AUTH-05): the suggested categories set by the admin, the
 * system ones, the default plan and the onboarding to do. No account: "Efectivo" is created in
 * step 1 only if the user keeps it (ADR 0035). Runs inside the registration transaction.
 * Starting over (AUTH-09) reuses `seedInitialData` and leaves the plan alone.
 */
@Injectable()
export class UserOnboardingService {
  constructor(
    private readonly settings: SettingsService,
    private readonly plans: PlansService,
  ) {}

  async setUp(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await this.seedInitialData(tx, userId, { categories: true });
    // PLN-02: everyone starts on the plan that is the default today.
    const plan = await this.plans.defaultPlan(tx);
    await tx.userPlan.create({ data: { userId, planId: plan.id, source: 'DEFAULT' } });
  }

  /** The suggested and system categories (unless the user keeps theirs) and step 1 again. */
  async seedInitialData(
    tx: Prisma.TransactionClient,
    userId: string,
    options: { categories: boolean },
  ): Promise<void> {
    if (options.categories) {
      const { categories } = await this.settings.value('suggested-categories', tx);
      await seedSuggestedCategories(tx, userId, categories);
    }
    await writeOnboarding(tx, userId, initialOnboardingState());
  }
}
