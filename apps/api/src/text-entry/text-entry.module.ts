import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AliasesService } from './aliases.service';
import { MerchantRulesService } from './merchant-rules.service';
import {
  AliasesController,
  MerchantRulesController,
  TextEntryController,
} from './text-entry.controller';
import { TextEntryService } from './text-entry.service';

@Module({
  imports: [SettingsModule],
  controllers: [TextEntryController, AliasesController, MerchantRulesController],
  providers: [AliasesService, MerchantRulesService, TextEntryService],
  exports: [MerchantRulesService, TextEntryService],
})
export class TextEntryModule {}
