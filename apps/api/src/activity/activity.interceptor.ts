import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { localDateToUtc, type LocalDate } from '@platin/domain';
import type { Observable } from 'rxjs';
import { AuthenticatedRequest } from '../common/current-user.decorator';
import { ClockService } from '../common/clock.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Records that a signed-in user was active today (ActivityDay and lastSeenAt), at most once
 * per user and day: a small in-memory map skips the database on every later request.
 * Runs as an interceptor, after the auth guard, so the user is already known.
 */
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);
  private readonly lastRecorded = new Map<string, LocalDate>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const userId = context.switchToHttp().getRequest<AuthenticatedRequest>().user?.id;
    if (userId) {
      const today = this.clock.today();
      if (this.lastRecorded.get(userId) !== today) {
        if (this.lastRecorded.size > 10_000) this.lastRecorded.clear();
        this.lastRecorded.set(userId, today);
        // Fire and forget: activity never slows down nor breaks the request.
        this.record(userId, today).catch((error: unknown) => {
          this.lastRecorded.delete(userId);
          this.logger.warn(`Could not record activity: ${String(error)}`);
        });
      }
    }
    return next.handle();
  }

  private async record(userId: string, today: LocalDate): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.activityDay.createMany({
        data: [{ userId, date: localDateToUtc(today) }],
        skipDuplicates: true,
      }),
      this.prisma.user.updateMany({
        where: { id: userId },
        data: { lastSeenAt: this.clock.now() },
      }),
    ]);
  }
}
