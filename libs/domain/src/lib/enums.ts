/** Shared enums. Values match the Prisma schema exactly. */

export const Currency = {
  ARS: 'ARS',
  USD: 'USD',
  EUR: 'EUR',
  BRL: 'BRL',
  CLP: 'CLP',
  UYU: 'UYU',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];
/** Every currency, in the order the app lists them (MON-01). */
export const CURRENCIES = Object.values(Currency) as readonly Currency[];

/** Cards stay in pesos and dollars, like the banks' statements (MON-05). */
export const CardCurrency = { ARS: 'ARS', USD: 'USD' } as const;
export type CardCurrency = (typeof CardCurrency)[keyof typeof CardCurrency];
export const CARD_CURRENCIES = Object.values(CardCurrency) as readonly CardCurrency[];

export function isCardCurrency(currency: Currency): currency is CardCurrency {
  return currency === Currency.ARS || currency === Currency.USD;
}

export const RateType = { OFICIAL: 'OFICIAL', MEP: 'MEP', BLUE: 'BLUE' } as const;
export type RateType = (typeof RateType)[keyof typeof RateType];

/** The institution or place: a bank, a wallet (Mercado Pago), cash, a broker. */
export const AccountKind = {
  BANK: 'BANK',
  WALLET: 'WALLET',
  CASH: 'CASH',
  BROKER: 'BROKER',
} as const;
export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

/** What a pocket is for; it decides where it shows up, not how its balance is calculated. */
export const PocketKind = {
  AVAILABLE: 'AVAILABLE',
  SAVINGS: 'SAVINGS',
  INVESTMENT: 'INVESTMENT',
} as const;
export type PocketKind = (typeof PocketKind)[keyof typeof PocketKind];

export const CategoryKind = { INCOME: 'INCOME', EXPENSE: 'EXPENSE' } as const;
export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind];

export const TxType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  ADJUSTMENT: 'ADJUSTMENT',
  YIELD: 'YIELD',
} as const;
export type TxType = (typeof TxType)[keyof typeof TxType];

export const TxStatus = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED' } as const;
export type TxStatus = (typeof TxStatus)[keyof typeof TxStatus];

export const TxOrigin = {
  MANUAL: 'MANUAL',
  FIXED: 'FIXED',
  ADJUSTMENT: 'ADJUSTMENT',
  VALUATION: 'VALUATION',
} as const;
export type TxOrigin = (typeof TxOrigin)[keyof typeof TxOrigin];

export const StatementStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
} as const;
export type StatementStatus = (typeof StatementStatus)[keyof typeof StatementStatus];

export const FixedKind = { INCOME: 'INCOME', EXPENSE: 'EXPENSE' } as const;
export type FixedKind = (typeof FixedKind)[keyof typeof FixedKind];

export const GoalStatus = {
  ACTIVE: 'ACTIVE',
  ACHIEVED: 'ACHIEVED',
  CANCELLED: 'CANCELLED',
} as const;
export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];

/** Instrument of an investment pocket. MUTUAL_FUND includes Superfondos. */
export const InstrumentType = {
  CEDEAR: 'CEDEAR',
  STOCK: 'STOCK',
  MUTUAL_FUND: 'MUTUAL_FUND',
  TERM_DEPOSIT: 'TERM_DEPOSIT',
  CRYPTO: 'CRYPTO',
  OTHER: 'OTHER',
} as const;
export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];

/** A statement that no longer accepts installments or edits. */
export function isStatementClosed(status: StatementStatus): boolean {
  return status !== StatementStatus.OPEN;
}
