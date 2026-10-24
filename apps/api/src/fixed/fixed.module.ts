import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { FixedController } from './fixed.controller';
import { FixedService } from './fixed.service';

@Module({
  imports: [AccountsModule, CategoriesModule],
  controllers: [FixedController],
  providers: [FixedService],
})
export class FixedModule {}
