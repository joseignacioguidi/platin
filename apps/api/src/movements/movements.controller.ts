import { Controller, Get, Query } from '@nestjs/common';
import {
  movementsPageSchema,
  movementsQuerySchema,
  movementsSummaryQuerySchema,
  movementsSummarySchema,
  type MovementsPage,
  type MovementsSummary,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { MovementsService } from './movements.service';

class MovementsQueryDto extends createZodDto(movementsQuerySchema) {}
class MovementsPageDto extends createZodDto(movementsPageSchema) {}
class SummaryQueryDto extends createZodDto(movementsSummaryQuerySchema) {}
class SummaryDto extends createZodDto(movementsSummarySchema) {}

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
