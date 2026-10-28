import { Module } from '@nestjs/common';
import { AccountsController, PocketsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { PocketBalancesService } from './pocket-balances.service';
import { PocketsService } from './pockets.service';

@Module({
  controllers: [AccountsController, PocketsController],
  providers: [AccountsService, PocketsService, PocketBalancesService],
  exports: [AccountsService, PocketsService, PocketBalancesService],
})
export class AccountsModule {}
