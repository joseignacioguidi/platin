import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  createValuationsRequestSchema,
  idParamSchema,
  investmentsSchema,
  valuationsResponseSchema,
  type Investments,
  type ValuationsResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { InvestmentsService } from './investments.service';

class InvestmentsDto extends createZodDto(investmentsSchema) {}
class CreateValuationsDto extends createZodDto(createValuationsRequestSchema) {}
class ValuationsDto extends createZodDto(valuationsResponseSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}

@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get()
  @ZodSerializerDto(InvestmentsDto)
  overview(@CurrentUser() user: AuthUser): Promise<Investments> {
    return this.investments.overview(user.id);
  }

  @Post('valuations')
  @ZodSerializerDto(ValuationsDto)
  createValuations(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateValuationsDto,
  ): Promise<ValuationsResponse> {
    return this.investments.createValuations(user.id, body);
  }
}

@Controller('valuations')
export class ValuationsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.investments.removeValuation(user.id, params.id);
  }
}

@Controller('pockets')
export class PocketValuationsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get(':id/valuations')
  @ZodSerializerDto(ValuationsDto)
  list(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<ValuationsResponse> {
    return this.investments.valuationsOf(user.id, params.id);
  }
}
