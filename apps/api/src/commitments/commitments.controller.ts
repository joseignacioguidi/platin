import { Controller, Get, Query } from '@nestjs/common';
import {
  commitmentsQuerySchema,
  commitmentsResponseSchema,
  type CommitmentsResponse,
} from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { CommitmentsService } from './commitments.service';

class CommitmentsQueryDto extends createZodDto(commitmentsQuerySchema) {}
class CommitmentsResponseDto extends createZodDto(commitmentsResponseSchema) {}

@Controller('commitments')
export class CommitmentsController {
  constructor(private readonly commitments: CommitmentsService) {}

  @Get()
  @ZodSerializerDto(CommitmentsResponseDto)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: CommitmentsQueryDto,
  ): Promise<CommitmentsResponse> {
    return this.commitments.byMonth(user.id, query.months);
  }
}
