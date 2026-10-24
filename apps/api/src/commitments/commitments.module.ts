import { Injectable, Module } from '@nestjs/common';
import { ClockService } from '../common/clock.service';
import { UserRates } from '../rates/user-rates.service';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsRateSource, CommitmentsService } from './commitments.service';

/** Values commitments with today's rate of the user's preferred type. */
@Injectable()
export class TodayRates extends CommitmentsRateSource {
  constructor(
    private readonly rates: UserRates,
    private readonly clock: ClockService,
  ) {
    super();
  }

  latestSell(userId: string): Promise<string | null> {
    return this.rates.sellFor(userId, this.clock.today());
  }
}

@Module({
  controllers: [CommitmentsController],
  providers: [CommitmentsService, { provide: CommitmentsRateSource, useClass: TodayRates }],
})
export class CommitmentsModule {}
