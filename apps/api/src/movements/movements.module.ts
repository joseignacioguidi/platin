import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { MovementsController, PocketMovementsController } from './movements.controller';
import { MovementsService } from './movements.service';

@Module({
  imports: [AccountsModule],
  controllers: [MovementsController, PocketMovementsController],
  providers: [MovementsService],
})
export class MovementsModule {}
