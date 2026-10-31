import { Injectable, Module } from '@nestjs/common';
import type { RateTable } from '@platin/domain';
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

  today(userId: string): Promise<RateTable> {
    return this.rates.tableFor(userId, this.clock.today());
  }
}

@Module({
  controllers: [CommitmentsController],
  providers: [CommitmentsService, { provide: CommitmentsRateSource, useClass: TodayRates }],
})
export class CommitmentsModule {}
