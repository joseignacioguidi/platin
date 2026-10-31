import { HttpStatus, Injectable } from '@nestjs/common';
import type { UpdateUserRequest, User } from '@platin/contracts';
import { blockedCurrencies, normalizeCurrencies } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { CurrenciesService } from '../common/currencies.service';
import { PrismaService } from '../prisma/prisma.service';
import { readPreferences, toUserDto } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencies: CurrenciesService,
  ) {}

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
            ? { preferences: { ...readPreferences(rows[0].preferences), ...preferences } }
            : {}),
        },
      });
    });
    return toUserDto(user);
  }
}
