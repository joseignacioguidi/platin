import { Injectable } from '@nestjs/common';
import { seedSuggestedCategories } from '../categories/suggested-categories';
import type { Prisma } from '../generated/prisma/client';

/** Data every new account starts with. Runs inside the registration transaction. */
@Injectable()
export class UserOnboardingService {
  async setUp(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await seedSuggestedCategories(tx, userId);
  }
}
