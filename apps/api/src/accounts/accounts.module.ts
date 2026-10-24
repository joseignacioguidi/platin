import { Module } from '@nestjs/common';
import { AccountBalancesService } from './account-balances.service';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountBalancesService],
  exports: [AccountsService, AccountBalancesService],
})
export class AccountsModule {}
