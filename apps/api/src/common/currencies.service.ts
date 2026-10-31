import { HttpStatus, Injectable } from '@nestjs/common';
import { Currency, normalizeCurrencies, periodOf } from '@platin/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from './app-exception';
import { ClockService } from './clock.service';
import { toDbPeriod } from './serialize';

/** MON-01/02/04: which currencies a user has enabled and which ones are in use. */
@Injectable()
export class CurrenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async enabled(userId: string): Promise<Currency[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { currencies: true, baseCurrency: true },
    });
    return normalizeCurrencies(user.currencies, user.baseCurrency);
  }

  /** 422 CURRENCY_NOT_ENABLED when the currency isn't enabled in the user's profile. */
  async assertEnabled(userId: string, ...currencies: Currency[]): Promise<void> {
    const enabled = await this.enabled(userId);
    const missing = currencies.find((currency) => !enabled.includes(currency));
    if (missing) {
      throw new AppException(
        'CURRENCY_NOT_ENABLED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        `${missing} is not enabled for this user`,
        undefined,
        { currency: missing },
      );
    }
  }

  /**
   * Currencies used by an active pocket, an active fixed item (not paused nor finished) or an
   * active goal (MON-04). History (archived pockets, old movements) doesn't count.
   */
  async inUse(userId: string): Promise<Currency[]> {
    const current = toDbPeriod(periodOf(this.clock.today()));
    const [pockets, fixed, goals] = await Promise.all([
      this.prisma.pocket.findMany({
        where: { userId, archivedAt: null },
        select: { currency: true },
        distinct: ['currency'],
      }),
      this.prisma.fixedItem.findMany({
        where: {
          userId,
          pausedAt: null,
          OR: [{ endPeriod: null }, { endPeriod: { gte: current } }],
        },
        select: { currency: true },
        distinct: ['currency'],
      }),
      this.prisma.goal.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { currency: true },
        distinct: ['currency'],
      }),
    ]);
    return [...new Set([...pockets, ...fixed, ...goals].map((row) => row.currency))];
  }
}
