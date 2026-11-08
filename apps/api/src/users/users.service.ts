import { HttpStatus, Injectable } from '@nestjs/common';
import type { DataSummary, ResetRequest, UpdateUserRequest, User } from '@platin/contracts';
import { blockedCurrencies, normalizeCurrencies } from '@platin/domain';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { UserOnboardingService } from '../auth/user-onboarding.service';
import { AppException } from '../common/app-exception';
import { CurrenciesService } from '../common/currencies.service';
import { countUserData, deleteFinancialData } from '../common/user-data';
import type { Prisma } from '../generated/prisma/client';
import { storedOnboarding } from '../onboarding/onboarding-state';
import { PrismaService } from '../prisma/prisma.service';
import { readPreferences, toUserDto } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
    private readonly passwords: PasswordService,
    private readonly onboarding: UserOnboardingService,
    private readonly audit: AuditService,
  ) {}

  async dataSummary(userId: string): Promise<DataSummary> {
    return this.prisma.$transaction((tx) => countUserData(tx, userId));
  }

  /**
   * AUTH-09: deletes every financial row, then recreates what a new user has. The account, its
   * sign-in methods, plan, preferences and sessions stay, and the onboarding opens again from
   * step 1. All or nothing.
   */
  async reset(userId: string, request: ResetRequest): Promise<DataSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppException.notFound('User not found');
    if (request.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppException(
        'CONFIRMATION_MISMATCH',
        HttpStatus.BAD_REQUEST,
        'The email does not match the account',
      );
    }
    if (user.passwordHash) {
      const valid =
        request.password !== undefined &&
        (await this.passwords.verify(user.passwordHash, request.password));
      if (!valid) {
        throw new AppException(
          'INVALID_CREDENTIALS',
          HttpStatus.UNAUTHORIZED,
          'Wrong email or password',
        );
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const counts = await countUserData(tx, userId);
      await deleteFinancialData(tx, userId, { keepCategories: request.keepCategories });
      await this.onboarding.seedInitialData(tx, userId, { categories: !request.keepCategories });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'user.reset',
        targetUserId: userId,
        payload: { keepCategories: request.keepCategories, counts },
      });
      return counts;
    });
  }

  async get(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppException.notFound('User not found');
    return toUserDto(user);
  }

  async update(userId: string, changes: UpdateUserRequest): Promise<User> {
    const { preferences, currencies, ...fields } = changes;
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw AppException.notFound('User not found');
    // MON-01: pesos and the base currency are always enabled (the new base, if it changes).
    const base = fields.baseCurrency ?? current.baseCurrency;
    const enabled = normalizeCurrencies(currencies ?? current.currencies, base);
    if (currencies) {
      const before = normalizeCurrencies(current.currencies, current.baseCurrency);
      const turningOff = before.filter((currency) => !enabled.includes(currency));
      const blocked = blockedCurrencies(turningOff, await this.currencies.inUse(userId));
      if (blocked.length > 0) {
        throw new AppException(
          'CURRENCY_IN_USE',
          HttpStatus.CONFLICT,
          `Still used by an active pocket, fixed item or goal: ${blocked.join(', ')}`,
          undefined,
          { currencies: blocked },
        );
      }
    }
    const user = await this.prisma.$transaction(async (tx) => {
      // Row lock: two devices saving different preferences don't lose each other's keys.
      const rows = await tx.$queryRaw<{ preferences: unknown }[]>`
        SELECT preferences FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      if (rows.length === 0) throw AppException.notFound('User not found');
      return tx.user.update({
        where: { id: userId },
        data: {
          ...fields,
          currencies: enabled,
          ...(preferences
            ? {
                preferences: {
                  ...readPreferences(rows[0].preferences),
                  // The onboarding state is not a preference the user edits (ADR 0035).
                  ...storedOnboarding(rows[0].preferences),
                  ...preferences,
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
    });
    return toUserDto(user);
  }
}
