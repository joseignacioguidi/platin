import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  confirmTransactionsRequestSchema,
  createTransactionRequestSchema,
  idParamSchema,
  transactionSchema,
  updateTransactionRequestSchema,
  type Transaction,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { TransactionsService } from './transactions.service';

class TransactionDto extends createZodDto(transactionSchema) {}
class CreateTransactionDto extends createZodDto(createTransactionRequestSchema) {}
class UpdateTransactionDto extends createZodDto(updateTransactionRequestSchema) {}
class ConfirmTransactionsDto extends createZodDto(confirmTransactionsRequestSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}

/** Incomes, expenses and adjustments. The combined list lives in GET /movements. */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  @ZodSerializerDto(TransactionDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateTransactionDto): Promise<Transaction> {
    return this.transactions.create(user.id, body);
  }

  @Post('confirm')
  @HttpCode(200)
  @ZodSerializerDto([TransactionDto])
  confirm(
    @CurrentUser() user: AuthUser,
    @Body() body: ConfirmTransactionsDto,
  ): Promise<Transaction[]> {
    return this.transactions.confirm(user.id, body);
  }

  @Get(':id')
  @ZodSerializerDto(TransactionDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Transaction> {
    return this.transactions.get(user.id, params.id);
  }

  @Patch(':id')
  @ZodSerializerDto(TransactionDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateTransactionDto,
  ): Promise<Transaction> {
    return this.transactions.update(user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.transactions.remove(user.id, params.id);
  }
}
