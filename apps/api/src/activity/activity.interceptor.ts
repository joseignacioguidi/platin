import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { localDateToUtc, type LocalDate } from '@platin/domain';
import { from, switchMap, type Observable } from 'rxjs';
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
    if (!userId) return next.handle();
    const today = this.clock.today();
    if (this.lastRecorded.get(userId) === today) return next.handle();
    if (this.lastRecorded.size > 10_000) this.lastRecorded.clear();
    this.lastRecorded.set(userId, today);
    // Awaited (once per user and day) so no write is left running after the response, but a
    // failure never breaks the request.
    const recorded = this.record(userId, today).catch((error: unknown) => {
      this.lastRecorded.delete(userId);
      this.logger.warn(`Could not record activity: ${String(error)}`);
    });
    return from(recorded).pipe(switchMap(() => next.handle()));
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
