import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock.service';
import { CurrenciesService } from './currencies.service';

@Global()
@Module({
  providers: [ClockService, CurrenciesService],
  exports: [ClockService, CurrenciesService],
})
export class CommonModule {}
