import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { TextEntryModule } from '../text-entry/text-entry.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { BotCommandsService } from './bot-commands.service';
import { BotDraftsService } from './bot-drafts.service';
import { HttpTelegramClient, TelegramClient } from './telegram-client';
import { TelegramController, TelegramWebhookController } from './telegram.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramUpdatesService } from './telegram-updates.service';

/** BOT-01 to 06. TelegramClient is replaced by a fake in tests. */
@Module({
  imports: [TransactionsModule, CardsModule, DashboardModule, TextEntryModule],
  controllers: [TelegramWebhookController, TelegramController],
  providers: [
    { provide: TelegramClient, useClass: HttpTelegramClient },
    TelegramLinkService,
    TelegramUpdatesService,
    BotDraftsService,
    BotCommandsService,
  ],
})
export class TelegramModule {}
