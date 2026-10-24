import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { CardsController, ChargesController, StatementsController } from './cards.controller';
import { CardsService } from './cards.service';
import { ChargesService } from './charges.service';
import { StatementsService } from './statements.service';

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [CardsController, ChargesController, StatementsController],
  providers: [CardsService, ChargesService, StatementsService],
  exports: [CardsService, StatementsService],
})
export class CardsModule {}
