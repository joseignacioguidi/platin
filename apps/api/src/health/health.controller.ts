import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@platin/contracts';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok', database: 'ok' };
  }
}
