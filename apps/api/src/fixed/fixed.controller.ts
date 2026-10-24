import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  changeFixedAmountRequestSchema,
  createFixedRequestSchema,
  fixedItemSchema,
  idParamSchema,
  updateFixedRequestSchema,
  type FixedItem,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { FixedService } from './fixed.service';

class FixedItemDto extends createZodDto(fixedItemSchema) {}
class CreateFixedDto extends createZodDto(createFixedRequestSchema) {}
class UpdateFixedDto extends createZodDto(updateFixedRequestSchema) {}
class ChangeAmountDto extends createZodDto(changeFixedAmountRequestSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}

@Controller('fixed')
export class FixedController {
  constructor(private readonly fixed: FixedService) {}

  @Get()
  @ZodSerializerDto([FixedItemDto])
  list(@CurrentUser() user: AuthUser): Promise<FixedItem[]> {
    return this.fixed.list(user.id);
  }

  @Post()
  @ZodSerializerDto(FixedItemDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateFixedDto): Promise<FixedItem> {
    return this.fixed.create(user.id, body);
  }

  @Get(':id')
  @ZodSerializerDto(FixedItemDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<FixedItem> {
    return this.fixed.get(user.id, params.id);
  }

  @Patch(':id')
  @ZodSerializerDto(FixedItemDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateFixedDto,
  ): Promise<FixedItem> {
    return this.fixed.update(user.id, params.id, body);
  }

  @Post(':id/amounts')
  @HttpCode(200)
  @ZodSerializerDto(FixedItemDto)
  changeAmount(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: ChangeAmountDto,
  ): Promise<FixedItem> {
    return this.fixed.changeAmount(user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.fixed.remove(user.id, params.id);
  }
}
