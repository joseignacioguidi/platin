/** Shared enums. Values match the Prisma schema exactly. */

export const Currency = { ARS: 'ARS', USD: 'USD' } as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const RateType = { OFICIAL: 'OFICIAL', MEP: 'MEP', BLUE: 'BLUE' } as const;
export type RateType = (typeof RateType)[keyof typeof RateType];

export const AccountType = {
  CASH: 'CASH',
  BANK: 'BANK',
  WALLET: 'WALLET',
  SAVINGS: 'SAVINGS',
  INVESTMENT: 'INVESTMENT',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const CategoryKind = { INCOME: 'INCOME', EXPENSE: 'EXPENSE' } as const;
export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind];

export const TxType = { INCOME: 'INCOME', EXPENSE: 'EXPENSE', ADJUSTMENT: 'ADJUSTMENT' } as const;
export type TxType = (typeof TxType)[keyof typeof TxType];

export const TxStatus = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED' } as const;
export type TxStatus = (typeof TxStatus)[keyof typeof TxStatus];

export const TxOrigin = { MANUAL: 'MANUAL', FIXED: 'FIXED', ADJUSTMENT: 'ADJUSTMENT' } as const;
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

export const InstrumentType = {
  USD_CASH: 'USD_CASH',
  TERM_DEPOSIT: 'TERM_DEPOSIT',
  MUTUAL_FUND: 'MUTUAL_FUND',
  CEDEAR: 'CEDEAR',
  STOCK: 'STOCK',
  CRYPTO: 'CRYPTO',
  OTHER: 'OTHER',
} as const;
export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];

/** A statement that no longer accepts installments or edits. */
export function isStatementClosed(status: StatementStatus): boolean {
  return status !== StatementStatus.OPEN;
}
