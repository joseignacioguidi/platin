import { Injectable } from '@nestjs/common';
import type { SyncResponse } from '@platin/contracts';
import { addMonths, duePeriods, maxDate, periodOf, utcToPeriod } from '@platin/domain';
import { StatementsService } from '../cards/statements.service';
import { ClockService } from '../common/clock.service';
import { toDbDate, toDbPeriod } from '../common/serialize';
import { FIXED_INCLUDE, toSchedule } from '../fixed/fixed.mapper';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs when the app opens (POST /sync): generates the pending movements of fixed items for
 * every period due since the last generation (FIJ-04) and creates missing card statements up
 * to the current one. Idempotent: the unique (fixedId, fixedPeriod) prevents duplicates even
 * if two syncs overlap.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statements: StatementsService,
    private readonly clock: ClockService,
  ) {}

  async sync(userId: string): Promise<SyncResponse> {
    const today = this.clock.today();
    const current = periodOf(today);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    return this.prisma.$transaction(
      async (tx) => {
        let generatedPending = 0;
        const fixedItems = await tx.fixedItem.findMany({
          where: { userId, accountId: { not: null }, pausedAt: null },
          include: FIXED_INCLUDE,
        });
        for (const fixed of fixedItems) {
          const schedule = toSchedule(fixed);
          const last = fixed.lastGeneratedPeriod ? utcToPeriod(fixed.lastGeneratedPeriod) : null;
          const from = last ? addMonths(last, 1) : schedule.startPeriod;
          const due = duePeriods(schedule, from, current);
          if (due.length > 0) {
            const sameCurrency = fixed.currency === user.baseCurrency;
            const { count } = await tx.transaction.createMany({
              data: due.map((occurrence) => ({
                userId,
                accountId: fixed.accountId as string,
                categoryId: fixed.categoryId,
                type: fixed.kind,
                status: 'PENDING' as const,
                origin: 'FIXED' as const,
                amount: occurrence.amount.toString(),
                currency: fixed.currency,
                // In another currency the rate is frozen when the movement is confirmed (ADR 0008).
                rateToBase: sameCurrency ? '1' : '0',
                baseAmount: sameCurrency ? occurrence.amount.toString() : '0',
                date: toDbDate(occurrence.date),
                description: fixed.name,
                fixedId: fixed.id,
                fixedPeriod: toDbPeriod(occurrence.period),
              })),
              skipDuplicates: true,
            });
            generatedPending += count;
          }
          if (!last || last < current) {
            await tx.fixedItem.update({
              where: { id: fixed.id },
              data: { lastGeneratedPeriod: toDbPeriod(last ? maxDate(last, current) : current) },
            });
          }
        }

        const before = await tx.cardStatement.count({ where: { userId } });
        const cards = await tx.creditCard.findMany({ where: { userId, archivedAt: null } });
        for (const card of cards) {
          const open = await this.statements.openPeriodFor(tx, card, today);
          await this.statements.ensure(tx, card, [open]);
        }
        const createdStatements = (await tx.cardStatement.count({ where: { userId } })) - before;

        await tx.user.update({ where: { id: userId }, data: { lastSyncedAt: this.clock.now() } });
        const pendingCount = await tx.transaction.count({ where: { userId, status: 'PENDING' } });
        return { generatedPending, createdStatements, pendingCount };
      },
      { timeout: 20_000 },
    );
  }
}
