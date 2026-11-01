import { Module } from '@nestjs/common';
import { CommitmentsModule } from '../commitments/commitments.module';
import { InvestmentsModule } from '../investments/investments.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [InvestmentsModule, CommitmentsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
