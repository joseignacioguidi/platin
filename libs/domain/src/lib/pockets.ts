import { PocketKind } from './enums';

/** How a transfer between pockets reads in the app: "Apartaste", "Invertiste", "Rescataste". */
export const TransferIntent = {
  SAVE: 'SAVE',
  INVEST: 'INVEST',
  REDEEM: 'REDEEM',
  MOVE: 'MOVE',
} as const;
export type TransferIntent = (typeof TransferIntent)[keyof typeof TransferIntent];

/**
 * CTA-05 / INV-02: the intent of a transfer comes from the kinds of its pockets.
 * - Into a savings pocket: set apart (SAVE).
 * - Into an investment pocket: invest (INVEST).
 * - From savings or investment back to an available pocket: redeem (REDEEM).
 * - Anything else (between available pockets, savings to savings...): move (MOVE).
 */
export function transferIntent(from: PocketKind, to: PocketKind): TransferIntent {
  if (to === PocketKind.SAVINGS && from !== PocketKind.SAVINGS) return TransferIntent.SAVE;
  if (to === PocketKind.INVESTMENT && from !== PocketKind.INVESTMENT) return TransferIntent.INVEST;
  if (to === PocketKind.AVAILABLE && from !== PocketKind.AVAILABLE) return TransferIntent.REDEEM;
  return TransferIntent.MOVE;
}

/** Whether a requested intent fits the pockets (the quick actions filter destinations by it). */
export function intentFits(intent: TransferIntent, from: PocketKind, to: PocketKind): boolean {
  return intent === TransferIntent.MOVE || transferIntent(from, to) === intent;
}
