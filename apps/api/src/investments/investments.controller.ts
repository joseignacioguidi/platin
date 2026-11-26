import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  createValuationsRequestSchema,
  holdingAdjustmentRequestSchema,
  holdingAdjustmentSchema,
  holdingAdjustmentsResponseSchema,
  holdingRequestSchema,
  type HoldingAdjustment,
  type HoldingAdjustmentsResponse,
  idParamSchema,
  investmentPocketSchema,
  investmentsSchema,
  termDepositRequestSchema,
  valuationsResponseSchema,
  type InvestmentPocket,
  type Investments,
  type ValuationsResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { RequiresFeature } from '../plans/requires-feature.decorator';
import { HoldingsService } from './holdings.service';
import { InvestmentsService } from './investments.service';

class InvestmentsDto extends createZodDto(investmentsSchema) {}
class CreateValuationsDto extends createZodDto(createValuationsRequestSchema) {}
class ValuationsDto extends createZodDto(valuationsResponseSchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class InvestmentPocketDto extends createZodDto(investmentPocketSchema) {}
class TermDepositDto extends createZodDto(termDepositRequestSchema) {}
class HoldingDto extends createZodDto(holdingRequestSchema) {}
class AdjustmentRequestDto extends createZodDto(holdingAdjustmentRequestSchema) {}
class AdjustmentDto extends createZodDto(holdingAdjustmentSchema) {}
class AdjustmentsDto extends createZodDto(holdingAdjustmentsResponseSchema) {}

// Hidden for plans without investments; existing data is kept and shows up again with them.
@RequiresFeature('investments')
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

  /** The investment as Inversiones shows it, with its pricing, for the pocket detail. */
  @Get(':id/investment')
  @ZodSerializerDto(InvestmentPocketDto)
  investment(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
  ): Promise<InvestmentPocket> {
    return this.investments.pocket(user.id, params.id);
  }

  /** INV-12: the terms of a term deposit. */
  @RequiresFeature('investments')
  @Put(':id/term-deposit')
  @ZodSerializerDto(InvestmentPocketDto)
  termDeposit(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: TermDepositDto,
  ): Promise<InvestmentPocket> {
    return this.investments.putTermDeposit(user.id, params.id, body);
  }
}

/** INV-07 / INV-10: link an investment to an instrument and correct its units. */
@Controller('pockets')
export class HoldingsController {
  constructor(private readonly holdings: HoldingsService) {}

  @RequiresFeature('investments')
  @Put(':id/holding')
  @ZodSerializerDto(InvestmentPocketDto)
  link(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: HoldingDto,
  ): Promise<InvestmentPocket> {
    return this.holdings.link(user.id, params.id, body);
  }

  @Delete(':id/holding')
  @ZodSerializerDto(InvestmentPocketDto)
  unlink(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<InvestmentPocket> {
    return this.holdings.unlink(user.id, params.id);
  }

  @Get(':id/holding/adjustments')
  @ZodSerializerDto(AdjustmentsDto)
  adjustments(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
  ): Promise<HoldingAdjustmentsResponse> {
    return this.holdings.adjustments(user.id, params.id);
  }

  @RequiresFeature('investments')
  @Post(':id/holding/adjustments')
  @ZodSerializerDto(AdjustmentDto)
  addAdjustment(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Body() body: AdjustmentRequestDto,
  ): Promise<HoldingAdjustment> {
    return this.holdings.addAdjustment(user.id, params.id, body);
  }
}

@Controller('holding-adjustments')
export class HoldingAdjustmentsController {
  constructor(private readonly holdings: HoldingsService) {}

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param() params: IdParamDto): Promise<void> {
    return this.holdings.removeAdjustment(user.id, params.id);
  }
}
