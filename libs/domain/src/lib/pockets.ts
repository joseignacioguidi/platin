import { PocketKind } from './enums';

/** How a transfer between pockets reads in the app: "Apartaste", "Invertiste", "Rescataste". */
export const TransferIntent = {
  SAVE: 'SAVE',
  INVEST: 'INVEST',
  REDEEM: 'REDEEM',
  MOVE: 'MOVE',
} as const;
export type TransferIntent = (typeof TransferIntent)[keyof typeof TransferIntent];

const isStored = (kind: PocketKind) =>
  kind === PocketKind.SAVINGS || kind === PocketKind.INVESTMENT;

/**
 * CTA-05 / INV-02: the intent of a transfer comes from the kinds of its pockets.
 * - Into a savings pocket: set apart (SAVE).
 * - Into an investment pocket: invest (INVEST).
 * - From savings or investment back to an account balance: redeem (REDEEM).
 * - Anything else (between account balances, to or from a spending reserve...): move (MOVE).
 */
export function transferIntent(from: PocketKind, to: PocketKind): TransferIntent {
  if (to === PocketKind.SAVINGS && from !== PocketKind.SAVINGS) return TransferIntent.SAVE;
  if (to === PocketKind.INVESTMENT && from !== PocketKind.INVESTMENT) return TransferIntent.INVEST;
  if (to === PocketKind.AVAILABLE && isStored(from)) return TransferIntent.REDEEM;
  return TransferIntent.MOVE;
}

/** Every transfer has an account balance on at least one end; between two reserves it goes through an account. */
export function transferHasAccount(from: PocketKind, to: PocketKind): boolean {
  return from === PocketKind.AVAILABLE || to === PocketKind.AVAILABLE;
}

/** Statements are paid from an account balance or a spending reserve (ADR 0024). */
export function canPayCards(kind: PocketKind): boolean {
  return kind === PocketKind.AVAILABLE || kind === PocketKind.SPENDING;
}

/** A reserve changes its use between spending, savings and investment; the account balance never changes kind. */
export function canChangeKind(from: PocketKind, to: PocketKind): boolean {
  return from === to || (from !== PocketKind.AVAILABLE && to !== PocketKind.AVAILABLE);
}
