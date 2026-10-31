import { Injectable } from '@nestjs/common';
import type { SyncResponse } from '@platin/contracts';
import { addMonths, duePeriods, maxDate, periodOf, utcToPeriod } from '@platin/domain';
import { ChargesService } from '../cards/charges.service';
import { StatementsService } from '../cards/statements.service';
import { ClockService } from '../common/clock.service';
import { toDbDate, toDbPeriod } from '../common/serialize';
import { FIXED_INCLUDE, toSchedule } from '../fixed/fixed.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';

/**
 * Runs when the app opens (POST /sync): generates the pending movements of fixed items for
 * every period due since the last generation (FIJ-04) and creates missing card statements up
 * to the current one. Fixed items on a card (TAR-09) become one-payment charges in the
 * statement of their day instead of pending movements. Idempotent: the unique
 * (fixedId, fixedPeriod) of movements and charges prevents duplicates even if two syncs overlap.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statements: StatementsService,
    private readonly charges: ChargesService,
    private readonly clock: ClockService,
    private readonly rates: RatesService,
  ) {}

  async sync(userId: string): Promise<SyncResponse> {
    const today = this.clock.today();
    const current = periodOf(today);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Rates refresh here too (there is no cron); a failure is not a sync failure.
    await this.rates.refreshIfStale();

    return this.prisma.$transaction(
      async (tx) => {
        let generatedPending = 0;
        let generatedCharges = 0;
        const fixedItems = await tx.fixedItem.findMany({
          where: { userId, pocketId: { not: null }, pausedAt: null },
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
                pocketId: fixed.pocketId as string,
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

        // TAR-09: subscriptions on a card. Archived cards stop receiving them.
        const cardFixed = await tx.fixedItem.findMany({
          where: { userId, cardId: { not: null }, pausedAt: null, card: { archivedAt: null } },
          include: { ...FIXED_INCLUDE, card: true },
        });
        for (const fixed of cardFixed) {
          const card = fixed.card;
          if (!card) continue;
          const schedule = toSchedule(fixed);
          const last = fixed.lastGeneratedPeriod ? utcToPeriod(fixed.lastGeneratedPeriod) : null;
          const from = last ? addMonths(last, 1) : schedule.startPeriod;
          for (const occurrence of duePeriods(schedule, from, current)) {
            const fixedPeriod = toDbPeriod(occurrence.period);
            // Claims (fixed, period) until commit: a concurrent sync waits here and then sees the
            // charge already created, so it skips it (the unique index is the last defense).
            const periodKey = Number(occurrence.period.replace('-', ''));
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fixed.id}), ${periodKey})`;
            const exists = await tx.cardCharge.findFirst({
              where: { fixedId: fixed.id, fixedPeriod },
              select: { id: true },
            });
            if (exists) continue;
            await this.charges.createInTx(tx, card, {
              categoryId: fixed.categoryId,
              description: fixed.name,
              date: occurrence.date,
              totalAmount: occurrence.amount.toString(),
              currency: fixed.currency,
              installmentsCount: 1,
              startInstallment: 1,
              fixedId: fixed.id,
              fixedPeriod,
            });
            generatedCharges += 1;
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
        return { generatedPending, generatedCharges, createdStatements, pendingCount };
      },
      { timeout: 20_000 },
    );
  }
}
