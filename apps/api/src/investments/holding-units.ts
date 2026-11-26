import { HttpStatus } from '@nestjs/common';
import { firstNegativeHolding, UnitsChange, UNITS_DECIMALS } from '@platin/domain';
import { AppException } from '../common/app-exception';
import { date } from '../common/serialize';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

export interface UnitsScenario {
  /** Initial units to use instead of the stored ones (linking). */
  initialUnits?: string;
  /** A change about to be recorded. */
  adding?: UnitsChange;
  /** A transfer or a correction about to be deleted. */
  withoutTransferId?: string;
  withoutAdjustmentId?: string;
}

/** Every unit change of a linked pocket: transfers with units and corrections. */
export async function unitChanges(
  client: Client,
  pocketId: string,
  scenario: UnitsScenario = {},
): Promise<UnitsChange[]> {
  const [transfers, adjustments] = await Promise.all([
    client.transfer.findMany({
      where: {
        units: { not: null },
        OR: [{ fromPocketId: pocketId }, { toPocketId: pocketId }],
        ...(scenario.withoutTransferId ? { id: { not: scenario.withoutTransferId } } : {}),
      },
      select: { fromPocketId: true, units: true, date: true },
    }),
    client.holdingAdjustment.findMany({
      where: {
        pocketId,
        ...(scenario.withoutAdjustmentId ? { id: { not: scenario.withoutAdjustmentId } } : {}),
      },
    }),
  ]);
  return [
    ...transfers.map((t) => ({
      date: date(t.date),
      direction: t.fromPocketId === pocketId ? ('OUT' as const) : ('IN' as const),
      units: (t.units as Prisma.Decimal).toFixed(UNITS_DECIMALS),
    })),
    ...adjustments.map((a) => ({
      date: date(a.date),
      direction: a.direction,
      units: a.units.toFixed(UNITS_DECIMALS),
    })),
    ...(scenario.adding ? [scenario.adding] : []),
  ];
}

/**
 * INV-09/10: the units of a linked investment can never be negative, at any date: rescuing more
 * than there is, a correction that subtracts too much or deleting a purchase answer
 * HOLDING_UNITS_NEGATIVE. A pocket that is not linked has nothing to check.
 */
export async function assertUnitsNotNegative(
  client: Client,
  pocketId: string,
  scenario: UnitsScenario = {},
): Promise<void> {
  const holding = await client.pocketHolding.findUnique({ where: { pocketId } });
  if (!holding && scenario.initialUnits === undefined) return;
  const initial = scenario.initialUnits ?? holding?.initialUnits.toFixed(UNITS_DECIMALS) ?? '0';
  const negativeAt = firstNegativeHolding(initial, await unitChanges(client, pocketId, scenario));
  if (negativeAt) {
    throw new AppException(
      'HOLDING_UNITS_NEGATIVE',
      HttpStatus.UNPROCESSABLE_ENTITY,
      `The units of the investment would be negative on ${negativeAt}`,
    );
  }
}
