import type { Movement } from '@platin/contracts';
import {
  addMonths,
  compareDates,
  Currency,
  lastDayOf,
  Money,
  parseLocalDate,
  Period,
} from '@platin/domain';

/** Signed effect of a listed movement on one pocket (pending ones don't count). */
export function effectOn(pocketId: string, movement: Movement, currency: Currency): Money {
  if (movement.kind === 'CARD_CHARGE') return Money.zero(currency);
  if (movement.kind === 'TRANSFER') {
    if (movement.fromPocket.id === pocketId) return Money.of(movement.amountOut, currency).negate();
    if (movement.toPocket?.id === pocketId) return Money.of(movement.amountIn, currency);
    return Money.zero(currency);
  }
  if (movement.status !== 'CONFIRMED') return Money.zero(currency);
  const amount = Money.of(movement.amount, currency);
  return movement.type === 'EXPENSE' ? amount.negate() : amount;
}

export interface MonthBalance {
  period: Period;
  balance: Money;
}

/**
 * CTA-04: the balance at the end of each of the last `months` months, walking back from the
 * current balance through the movements (newest first). When the list is incomplete
 * (`complete` false), months older than the oldest loaded movement are left out.
 */
export function monthEndBalances(
  pocketId: string,
  balance: Money,
  movements: readonly Movement[],
  current: Period,
  months: number,
  complete: boolean,
): MonthBalance[] {
  const oldest = movements.at(-1)?.date;
  const result: MonthBalance[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const period = addMonths(current, -offset);
    const end = lastDayOf(period);
    if (!complete && oldest && compareDates(parseLocalDate(oldest), end) > 0) continue;
    const later = movements.filter((m) => compareDates(parseLocalDate(m.date), end) > 0);
    const undone = later.reduce(
      (sum, m) => sum.add(effectOn(pocketId, m, balance.currency)),
      Money.zero(balance.currency),
    );
    result.push({ period, balance: balance.subtract(undone) });
  }
  return result;
}
