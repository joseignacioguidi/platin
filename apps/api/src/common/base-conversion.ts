import { HttpStatus } from '@nestjs/common';
import { canConvert, Currency, Money, RatesInput, toBase } from '@platin/domain';
import { AppException } from './app-exception';

export interface FrozenBase {
  rateToBase: string;
  baseAmount: string;
}

/**
 * Freezes the base-currency value of a movement. Same currency: factor 1. Otherwise it needs a
 * rate: the one the user typed (pesos per unit of the other currency) or the table of the day
 * (pesos per unit of every currency with a known rate).
 */
export function freezeBase(
  amount: Money,
  baseCurrency: Currency,
  rates: RatesInput | undefined,
): FrozenBase {
  if (amount.currency === baseCurrency) {
    return { rateToBase: '1.000000', baseAmount: amount.toString() };
  }
  if (rates === undefined || !canConvert(amount.currency, baseCurrency, rates)) {
    throw new AppException(
      'EXCHANGE_RATE_REQUIRED',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'An exchange rate is required for amounts in another currency',
    );
  }
  const frozen = toBase(amount, baseCurrency, rates);
  return { rateToBase: frozen.rateToBase, baseAmount: frozen.baseAmount.toString() };
}
