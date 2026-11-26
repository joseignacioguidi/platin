import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  HoldingAdjustment,
  HoldingAdjustmentRequest,
  HoldingAdjustmentsResponse,
  HoldingRequest,
  InvestmentPocket,
} from '@platin/contracts';
import { Decimal, UNITS_DECIMALS } from '@platin/domain';
import { PocketsService, PocketWithAccount } from '../accounts/pockets.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { date, toDbDate } from '../common/serialize';
import type { HoldingAdjustment as AdjustmentRow } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertUnitsNotNegative } from './holding-units';
import { InvestmentsService } from './investments.service';

const units = (value: string) => new Decimal(value).toFixed(UNITS_DECIMALS);

function toAdjustmentDto(row: AdjustmentRow): HoldingAdjustment {
  return {
    id: row.id,
    pocketId: row.pocketId,
    date: date(row.date),
    units: row.units.toFixed(UNITS_DECIMALS),
    direction: row.direction,
    note: row.note,
  };
}

/**
 * INV-07 / INV-10: an investment linked to an instrument of the catalog, its corrections of
 * units, and going back to manual. Links hang from the pocket and are filtered by its user.
 */
@Injectable()
export class HoldingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pockets: PocketsService,
    private readonly investments: InvestmentsService,
    private readonly clock: ClockService,
  ) {}

  /** Links (or relinks) the pocket to an instrument with the units it already had. */
  async link(userId: string, pocketId: string, request: HoldingRequest): Promise<InvestmentPocket> {
    const pocket = await this.investmentPocket(userId, pocketId);
    const instrument = await this.prisma.instrument.findUnique({
      where: { id: request.instrumentId },
    });
    const current = await this.prisma.pocketHolding.findUnique({ where: { pocketId } });
    // An inactive instrument can only stay linked where it already was.
    if (!instrument || (!instrument.active && current?.instrumentId !== instrument.id)) {
      throw AppException.notFound('Instrument not found');
    }
    if (pocket.instrument !== instrument.type) {
      throw new AppException(
        'INSTRUMENT_TYPE_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The instrument is not of the investment type',
      );
    }
    if (pocket.currency !== instrument.currency) {
      throw new AppException(
        'INSTRUMENT_CURRENCY_MISMATCH',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The instrument is in another currency than the investment',
      );
    }
    const initialUnits = units(request.initialUnits);
    await this.prisma.$transaction(async (tx) => {
      // A pocket is either linked or a term deposit, never both.
      await tx.termDeposit.deleteMany({ where: { pocketId } });
      await assertUnitsNotNegative(tx, pocketId, { initialUnits });
      await tx.pocketHolding.upsert({
        where: { pocketId },
        create: { pocketId, instrumentId: instrument.id, initialUnits },
        update: { instrumentId: instrument.id, initialUnits },
      });
    });
    return this.investments.pocket(userId, pocketId);
  }

  /** Back to manual: valuations and movements stay; the corrections go with the link. */
  async unlink(userId: string, pocketId: string): Promise<InvestmentPocket> {
    await this.investmentPocket(userId, pocketId);
    await this.prisma.$transaction([
      this.prisma.holdingAdjustment.deleteMany({ where: { pocketId } }),
      this.prisma.pocketHolding.deleteMany({ where: { pocketId } }),
    ]);
    return this.investments.pocket(userId, pocketId);
  }

  async adjustments(userId: string, pocketId: string): Promise<HoldingAdjustmentsResponse> {
    await this.investmentPocket(userId, pocketId, { active: false });
    const rows = await this.prisma.holdingAdjustment.findMany({
      where: { pocketId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return { items: rows.map(toAdjustmentDto) };
  }

  /** INV-10: adds or subtracts units with a date and a reason, without moving money. */
  async addAdjustment(
    userId: string,
    pocketId: string,
    request: HoldingAdjustmentRequest,
  ): Promise<HoldingAdjustment> {
    await this.investmentPocket(userId, pocketId);
    this.clock.assertNotFuture(request.date);
    const holding = await this.prisma.pocketHolding.findUnique({ where: { pocketId } });
    if (!holding) throw this.notLinked();
    const amount = units(request.units);
    await assertUnitsNotNegative(this.prisma, pocketId, {
      adding: { date: request.date, direction: request.direction, units: amount },
    });
    const row = await this.prisma.holdingAdjustment.create({
      data: {
        pocketId,
        date: toDbDate(request.date),
        units: amount,
        direction: request.direction,
        note: request.note || null,
      },
    });
    return toAdjustmentDto(row);
  }

  async removeAdjustment(userId: string, id: string): Promise<void> {
    const row = await this.prisma.holdingAdjustment.findFirst({
      where: { id, pocket: { userId } },
    });
    if (!row) throw AppException.notFound('Correction not found');
    await assertUnitsNotNegative(this.prisma, row.pocketId, { withoutAdjustmentId: id });
    await this.prisma.holdingAdjustment.delete({ where: { id } });
  }

  private async investmentPocket(
    userId: string,
    pocketId: string,
    { active = true }: { active?: boolean } = {},
  ): Promise<PocketWithAccount> {
    const pocket = active
      ? await this.pockets.getActive(userId, pocketId)
      : await this.pockets.getOwned(userId, pocketId);
    if (pocket.kind !== 'INVESTMENT') {
      throw new AppException(
        'NOT_AN_INVESTMENT',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Only investment pockets are linked to instruments',
      );
    }
    return pocket;
  }

  private notLinked(): AppException {
    return new AppException(
      'HOLDING_NOT_LINKED',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'The investment is not linked to an instrument',
    );
  }
}
