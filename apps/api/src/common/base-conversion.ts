import { HttpStatus } from '@nestjs/common';
import { Currency, Money, toBase } from '@platin/domain';
import { AppException } from './app-exception';

export interface FrozenBase {
  rateToBase: string;
  baseAmount: string;
}

/**
 * Freezes the base-currency value of a movement. Same currency: factor 1. Otherwise it needs
 * the exchange rate (ARS per USD); until phase 6 the client sends it.
 */
export function freezeBase(
  amount: Money,
  baseCurrency: Currency,
  exchangeRate: string | undefined,
): FrozenBase {
  if (amount.currency === baseCurrency) {
    return { rateToBase: '1.000000', baseAmount: amount.toString() };
  }
  if (!exchangeRate) {
    throw new AppException(
      'EXCHANGE_RATE_REQUIRED',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'An exchange rate is required for amounts in another currency',
    );
  }
  const frozen = toBase(amount, baseCurrency, exchangeRate);
  return { rateToBase: frozen.rateToBase, baseAmount: frozen.baseAmount.toString() };
}
