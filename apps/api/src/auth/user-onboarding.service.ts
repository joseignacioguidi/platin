import { Injectable } from '@nestjs/common';
import { AVAILABLE_POCKET_NAME } from '../accounts/accounts.service';
import { seedSuggestedCategories } from '../categories/suggested-categories';
import type { Prisma } from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { SettingsService } from '../settings/settings.service';

/** Name of the account every user starts with. */
export const CASH_ACCOUNT_NAME = 'Efectivo';

/**
 * Data every new user starts with (AUTH-05): the suggested categories set by the admin, the
 * system ones, the default plan and the
 * "Efectivo" account with its "Disponible" pocket in pesos. Runs inside the registration
 * transaction.
 */
@Injectable()
export class UserOnboardingService {
  constructor(
    private readonly settings: SettingsService,
    private readonly plans: PlansService,
  ) {}

  async setUp(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const { categories } = await this.settings.value('suggested-categories', tx);
    await seedSuggestedCategories(tx, userId, categories);
    // PLN-02: everyone starts on the plan that is the default today.
    const plan = await this.plans.defaultPlan(tx);
    await tx.userPlan.create({ data: { userId, planId: plan.id, source: 'DEFAULT' } });
    const cash = await tx.account.create({
      data: { userId, name: CASH_ACCOUNT_NAME, kind: 'CASH', color: 'brand' },
    });
    await tx.pocket.create({
      data: {
        userId,
        accountId: cash.id,
        name: AVAILABLE_POCKET_NAME,
        kind: 'AVAILABLE',
        currency: 'ARS',
      },
    });
  }
}
