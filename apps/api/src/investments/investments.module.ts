import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import {
  InvestmentsController,
  PocketValuationsController,
  ValuationsController,
} from './investments.controller';
import { InvestmentsService } from './investments.service';

@Module({
  imports: [AccountsModule],
  controllers: [InvestmentsController, ValuationsController, PocketValuationsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
