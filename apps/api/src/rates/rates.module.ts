import { Global, Module } from '@nestjs/common';
import { DolarApiProvider, RateProvider } from './rate-provider';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';
import { UserRates } from './user-rates.service';

/** Global: every module that freezes or values amounts in base currency uses it. */
@Global()
@Module({
  controllers: [RatesController],
  providers: [RatesService, UserRates, { provide: RateProvider, useClass: DolarApiProvider }],
  exports: [RatesService, UserRates],
})
export class RatesModule {}
