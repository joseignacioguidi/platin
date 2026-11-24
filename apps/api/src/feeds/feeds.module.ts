import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { AppConfig } from '../config/app-config';
import { SettingsModule } from '../settings/settings.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { FEED_PROVIDERS } from './account-feed-provider';
import { FeedIngestService } from './feed-ingest.service';
import { FeedProviderRegistry, feedProvidersFromConfig } from './feed-provider.registry';
import { FeedTokenCipher } from './feed-token-cipher';
import {
  FeedMovementsController,
  FeedsController,
  FeedWebhookController,
} from './feeds.controller';
import { FeedsService } from './feeds.service';

/** MPG-01 to 10 (ADR 0037). FEED_PROVIDERS is replaced by a fake in tests. */
@Module({
  imports: [TransactionsModule, CardsModule, SettingsModule],
  controllers: [FeedWebhookController, FeedsController, FeedMovementsController],
  providers: [
    { provide: FEED_PROVIDERS, useFactory: feedProvidersFromConfig, inject: [AppConfig] },
    FeedProviderRegistry,
    FeedTokenCipher,
    FeedIngestService,
    FeedsService,
  ],
  exports: [FeedIngestService, FeedProviderRegistry],
})
export class FeedsModule {}
