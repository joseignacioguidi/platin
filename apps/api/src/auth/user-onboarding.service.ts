import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

/** Data every new account starts with. Runs inside the registration transaction. */
@Injectable()
export class UserOnboardingService {
  async setUp(_tx: Prisma.TransactionClient, _userId: string): Promise<void> {
    // Filled in by later phases (suggested categories in phase 3).
  }
}
