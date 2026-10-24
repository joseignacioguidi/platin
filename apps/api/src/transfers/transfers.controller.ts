import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  createTransferRequestSchema,
  idParamSchema,
  transferSchema,
  type Transfer,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { TransfersService } from './transfers.service';

class TransferDto extends createZodDto(transferSchema) {}
class CreateTransferDto extends createZodDto(createTransferRequestSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ZodSerializerDto(TransferDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTransferDto): Promise<Transfer> {
    return this.transfers.create(user.id, body);
  }

  @Get(':id')
  @ZodSerializerDto(TransferDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Transfer> {
    return this.transfers.get(user.id, params.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.transfers.remove(user.id, params.id);
  }
}
