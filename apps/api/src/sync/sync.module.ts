import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { FeedsModule } from '../feeds/feeds.module';
import { InvestmentsModule } from '../investments/investments.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [CardsModule, FeedsModule, InvestmentsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
