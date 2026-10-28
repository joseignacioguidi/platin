import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  idParamSchema,
  movementsPageSchema,
  movementsQuerySchema,
  movementsSummaryQuerySchema,
  movementsSummarySchema,
  type MovementsPage,
  type MovementsSummary,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { PocketsService } from '../accounts/pockets.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { MovementsService } from './movements.service';

class MovementsQueryDto extends createZodDto(movementsQuerySchema) {}
class MovementsPageDto extends createZodDto(movementsPageSchema) {}
class SummaryQueryDto extends createZodDto(movementsSummaryQuerySchema) {}
class SummaryDto extends createZodDto(movementsSummarySchema) {}
class IdParamDto extends createZodDto(idParamSchema) {}
class PocketMovementsQueryDto extends createZodDto(
  z.object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
) {}

/** Read-only combined list of movements and transfers (see docs/adr/0006). */
@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  @ZodSerializerDto(MovementsPageDto)
  list(@CurrentUser() user: AuthUser, @Query() query: MovementsQueryDto): Promise<MovementsPage> {
    return this.movements.list(user.id, query);
  }

  @Get('summary')
  @ZodSerializerDto(SummaryDto)
  summary(
    @CurrentUser() user: AuthUser,
    @Query() query: SummaryQueryDto,
  ): Promise<MovementsSummary> {
    return this.movements.summary(user.id, query.period);
  }
}

/** CTA-04: the movements of one pocket (transactions and transfers in or out). */
@Controller('pockets')
export class PocketMovementsController {
  constructor(
    private readonly movements: MovementsService,
    private readonly pockets: PocketsService,
  ) {}

  @Get(':id/transactions')
  @ZodSerializerDto(MovementsPageDto)
  async list(
    @CurrentUser() user: AuthUser,
    @Param() params: IdParamDto,
    @Query() query: PocketMovementsQueryDto,
  ): Promise<MovementsPage> {
    await this.pockets.getOwned(user.id, params.id);
    return this.movements.list(user.id, { ...query, pocketId: params.id });
  }
}
