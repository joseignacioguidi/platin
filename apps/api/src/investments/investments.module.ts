import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import {
  HoldingAdjustmentsController,
  HoldingsController,
  InvestmentsController,
  PocketValuationsController,
  ValuationsController,
} from './investments.controller';
import { HoldingsService } from './holdings.service';
import { InvestmentPricingService } from './investment-pricing.service';
import { InvestmentsService } from './investments.service';

@Module({
  imports: [AccountsModule],
  controllers: [
    InvestmentsController,
    ValuationsController,
    PocketValuationsController,
    HoldingsController,
    HoldingAdjustmentsController,
  ],
  providers: [InvestmentsService, InvestmentPricingService, HoldingsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
