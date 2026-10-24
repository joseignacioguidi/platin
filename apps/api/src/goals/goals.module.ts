import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { GoalsController, SavingsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AccountsModule],
  controllers: [GoalsController, SavingsController],
  providers: [GoalsService],
})
export class GoalsModule {}
