import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [CardsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
