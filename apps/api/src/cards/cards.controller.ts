import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  activeInstallmentSchema,
  cardSchema,
  chargeSchema,
  closeStatementRequestSchema,
  createCardRequestSchema,
  createChargeRequestSchema,
  idParamSchema,
  payStatementRequestSchema,
  statementDetailSchema,
  statementsQuerySchema,
  statementSummarySchema,
  updateCardRequestSchema,
  updateChargeRequestSchema,
  type ActiveInstallment,
  type Card,
  type Charge,
  type StatementDetail,
  type StatementSummary,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CardsService } from './cards.service';
import { ChargesService } from './charges.service';
import { StatementsService } from './statements.service';

class CardDto extends createZodDto(cardSchema) {}
class CreateCardDto extends createZodDto(createCardRequestSchema) {}
class UpdateCardDto extends createZodDto(updateCardRequestSchema) {}
class StatementSummaryDto extends createZodDto(statementSummarySchema) {}
class StatementDetailDto extends createZodDto(statementDetailSchema) {}
class StatementsQueryDto extends createZodDto(statementsQuerySchema) {}
class ChargeDto extends createZodDto(chargeSchema) {}
class CreateChargeDto extends createZodDto(createChargeRequestSchema) {}
class UpdateChargeDto extends createZodDto(updateChargeRequestSchema) {}
class ActiveInstallmentDto extends createZodDto(activeInstallmentSchema) {}
class CloseStatementDto extends createZodDto(closeStatementRequestSchema) {}
class PayStatementDto extends createZodDto(payStatementRequestSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class ArchivedQueryDto extends createZodDto(
  z.object({ archived: z.enum(['true', 'false']).optional() }),
) {}
class InstallmentsQueryDto extends createZodDto(
  z.object({ active: z.enum(['true', 'false']).optional() }),
) {}

@Controller('cards')
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly charges: ChargesService,
  ) {}

  @Get()
  @ZodSerializerDto([CardDto])
  list(@CurrentUser() user: AuthUser, @Query() query: ArchivedQueryDto): Promise<Card[]> {
    return this.cards.list(user.id, query.archived === 'true');
  }

  @Post()
  @ZodSerializerDto(CardDto)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateCardDto): Promise<Card> {
    return this.cards.create(user.id, body);
  }

  @Get(':id')
  @ZodSerializerDto(CardDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Card> {
    return this.cards.get(user.id, params.id);
  }

  @Patch(':id')
  @ZodSerializerDto(CardDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateCardDto,
  ): Promise<Card> {
    return this.cards.update(user.id, params.id, body);
  }

  /** TAR-04: open and upcoming statements (created when needed). */
  @Get(':id/statements')
  @ZodSerializerDto([StatementSummaryDto])
  statements(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Query() query: StatementsQueryDto,
  ): Promise<StatementSummary[]> {
    return this.cards.statementsOf(user.id, params.id, query.from, query.to);
  }

  @Get(':id/installments')
  @ZodSerializerDto([ActiveInstallmentDto])
  installments(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Query() query: InstallmentsQueryDto,
  ): Promise<ActiveInstallment[]> {
    return this.cards.activeInstallments(user.id, params.id, query.active !== 'false');
  }

  @Post(':id/charges')
  @ZodSerializerDto(ChargeDto)
  createCharge(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: CreateChargeDto,
  ): Promise<Charge> {
    return this.charges.create(user.id, params.id, body);
  }
}

@Controller('charges')
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @Get(':id')
  @ZodSerializerDto(ChargeDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<Charge> {
    return this.charges.get(user.id, params.id);
  }

  @Patch(':id')
  @ZodSerializerDto(ChargeDto)
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: UpdateChargeDto,
  ): Promise<Charge> {
    return this.charges.update(user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.charges.remove(user.id, params.id);
  }
}

@Controller('statements')
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Get(':id')
  @ZodSerializerDto(StatementDetailDto)
  get(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<StatementDetail> {
    return this.statements.detail(user.id, params.id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ZodSerializerDto(StatementSummaryDto)
  close(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: CloseStatementDto,
  ): Promise<StatementSummary> {
    return this.statements.close(user.id, params.id, body);
  }

  @Post(':id/payments')
  @ZodSerializerDto(StatementSummaryDto)
  pay(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: PayStatementDto,
  ): Promise<StatementSummary> {
    return this.statements.pay(user.id, params.id, body);
  }
}
