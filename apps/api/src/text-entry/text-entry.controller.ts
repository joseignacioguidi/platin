import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  aliasesResponseSchema,
  createMerchantRuleRequestSchema,
  idParamSchema,
  merchantRuleSchema,
  putAliasesRequestSchema,
  textEntryContextSchema,
  updateMerchantRuleRequestSchema,
  type AliasesResponse,
  type MerchantRule,
  type TextEntryContextResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AliasesService } from './aliases.service';
import { MerchantRulesService } from './merchant-rules.service';
import { TextEntryService } from './text-entry.service';

class IdParamDto extends createZodDto(idParamSchema) {}
class PutAliasesDto extends createZodDto(putAliasesRequestSchema) {}
class AliasesResponseDto extends createZodDto(aliasesResponseSchema) {}
class MerchantRuleDto extends createZodDto(merchantRuleSchema) {}
class CreateMerchantRuleDto extends createZodDto(createMerchantRuleRequestSchema) {}
class UpdateMerchantRuleDto extends createZodDto(updateMerchantRuleRequestSchema) {}
class TextEntryContextDto extends createZodDto(textEntryContextSchema) {}

/** TXT-01: what the parser in the browser needs. */
@Controller('text-entry')
export class TextEntryController {
  constructor(private readonly textEntry: TextEntryService) {}

  @Get('context')
  @ZodSerializerDto(TextEntryContextDto)
  context(@CurrentUser() user: AuthUser): Promise<TextEntryContextResponse> {
    return this.textEntry.context(user.id);
  }
}

/** TXT-02: "Nombres para escribir" of accounts and cards. */
@Controller()
export class AliasesController {
  constructor(private readonly aliases: AliasesService) {}

  @Put('accounts/:id/aliases')
  @ZodSerializerDto(AliasesResponseDto)
  putForAccount(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: PutAliasesDto,
  ): Promise<AliasesResponse> {
    return this.aliases.putForAccount(user.id, params.id, body.aliases);
  }

  @Put('cards/:id/aliases')
  @ZodSerializerDto(AliasesResponseDto)
  putForCard(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: PutAliasesDto,
  ): Promise<AliasesResponse> {
    return this.aliases.putForCard(user.id, params.id, body.aliases);
  }
}

/** TXT-03: the user's merchant rules. */
@Controller('merchant-rules')
export class MerchantRulesController {
  constructor(private readonly rules: MerchantRulesService) {}

  @Get()
  @ZodSerializerDto([MerchantRuleDto])
  list(@CurrentUser() user: AuthUser): Promise<MerchantRule[]> {
    return this.rules.list(user.id);
  }

  @Post()
  @ZodSerializerDto(MerchantRuleDto)
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateMerchantRuleDto,
  ): Promise<MerchantRule> {
    return this.rules.create(user.id, body);
  }

  @Patch(':id')
  @ZodSerializerDto(MerchantRuleDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateMerchantRuleDto,
  ): Promise<MerchantRule> {
    return this.rules.update(user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    await this.rules.remove(user.id, params.id);
  }
}
