import { Injectable } from '@nestjs/common';
import { LocalDate } from '@platin/domain';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from './rates.service';

/** Rates seen through a user's preference (oficial, MEP or blue). */
@Injectable()
export class UserRates {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
  ) {}

  /** ARS per USD (sell) of the user's preferred type for a date, or null if none is known. */
  async sellFor(userId: string, day: LocalDate): Promise<string | null> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return (await this.rates.rateFor(user.valuationRate, day))?.sell ?? null;
  }
}
