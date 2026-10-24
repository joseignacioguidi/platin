import { Controller, HttpCode, Post } from '@nestjs/common';
import { syncResponseSchema, type SyncResponse } from '@platin/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { SyncService } from './sync.service';

class SyncResponseDto extends createZodDto(syncResponseSchema) {}

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @HttpCode(200)
  @ZodSerializerDto(SyncResponseDto)
  sync(@CurrentUser() user: AuthUser): Promise<SyncResponse> {
    return this.syncService.sync(user.id);
  }
}
