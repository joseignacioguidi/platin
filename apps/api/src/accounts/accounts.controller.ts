import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  accountSchema,
  accountsResponseSchema,
  adjustBalanceRequestSchema,
  adjustBalanceResponseSchema,
  createAccountRequestSchema,
  createPocketRequestSchema,
  idParamSchema,
  pocketSchema,
  updateAccountRequestSchema,
  updatePocketRequestSchema,
  type Account,
  type AccountsResponse,
  type AdjustBalanceResponse,
  type Pocket,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { AccountsService } from './accounts.service';
import { PocketsService } from './pockets.service';

class AccountDto extends createZodDto(accountSchema) {}
class AccountsResponseDto extends createZodDto(accountsResponseSchema) {}
class CreateAccountDto extends createZodDto(createAccountRequestSchema) {}
class UpdateAccountDto extends createZodDto(updateAccountRequestSchema) {}
class PocketDto extends createZodDto(pocketSchema) {}
class CreatePocketDto extends createZodDto(createPocketRequestSchema) {}
class UpdatePocketDto extends createZodDto(updatePocketRequestSchema) {}
class AdjustBalanceDto extends createZodDto(adjustBalanceRequestSchema) {}
class AdjustBalanceResponseDto extends createZodDto(adjustBalanceResponseSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class ListQueryDto extends createZodDto(
  z.object({ archived: z.enum(['true', 'false']).optional() }),
) {}

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly pockets: PocketsService,
  ) {}

  @Get()
  @ZodSerializerDto(AccountsResponseDto)
  list(@CurrentUser() user: AuthUser, @Query() query: ListQueryDto): Promise<AccountsResponse> {
    return this.accounts.list(user.id, query.archived === 'true');
  }

  @Get(':id')
  @ZodSerializerDto(AccountDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Account> {
    return this.accounts.get(user.id, params.id);
  }

  @Post()
  @ZodSerializerDto(AccountDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAccountDto): Promise<Account> {
    return this.accounts.create(user.id, body);
  }

  @Patch(':id')
  @ZodSerializerDto(AccountDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateAccountDto,
  ): Promise<Account> {
    return this.accounts.update(user.id, params.id, body);
  }

  @Post(':id/pockets')
  @ZodSerializerDto(PocketDto)
  createPocket(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: CreatePocketDto,
  ): Promise<Pocket> {
    return this.pockets.create(user.id, params.id, body);
  }
}

@Controller('pockets')
export class PocketsController {
  constructor(private readonly pockets: PocketsService) {}

  @Get(':id')
  @ZodSerializerDto(PocketDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Pocket> {
    return this.pockets.get(user.id, params.id);
  }

  @Patch(':id')
  @ZodSerializerDto(PocketDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdatePocketDto,
  ): Promise<Pocket> {
    return this.pockets.update(user.id, params.id, body);
  }

  @Post(':id/adjust')
  @HttpCode(200)
  @ZodSerializerDto(AdjustBalanceResponseDto)
  async adjust(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: AdjustBalanceDto,
  ): Promise<AdjustBalanceResponse> {
    return { adjustment: await this.pockets.adjust(user.id, params.id, body) };
  }
}
