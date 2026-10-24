import { Injectable, Module } from '@nestjs/common';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsRateSource, CommitmentsService } from './commitments.service';

/** No automatic rates yet: USD commitments are reported but not valued (phase 6 replaces it). */
@Injectable()
export class NoRates extends CommitmentsRateSource {
  async latestSell(): Promise<string | null> {
    return null;
  }
}

@Module({
  controllers: [CommitmentsController],
  providers: [CommitmentsService, { provide: CommitmentsRateSource, useClass: NoRates }],
})
export class CommitmentsModule {}
