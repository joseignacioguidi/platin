import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { InvestmentsModule } from '../investments/investments.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AccountsModule, InvestmentsModule, CommitmentsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
