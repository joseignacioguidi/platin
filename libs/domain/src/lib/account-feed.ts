/**
 * Movements that come from a connected institution (Mercado Pago, MPG-01 to 10, ADR 0037):
 * what each one becomes in platin. Pure: the account, its pockets, the reserves, the candidates
 * for "Ya lo cargaste", the rules and the day's usage come in the context.
 */
import { compareDates, daysBetween, LocalDate } from './dates';
import { CategoryKind, Currency, PocketKind } from './enums';
import { Money } from './money';
import {
  categoryByMerchantRules,
  normalizeText,
  type TextEntryCategory,
  type TextEntryGlobalRule,
  type TextEntryRule,
} from './text-entry';

export const FeedProvider = { MERCADO_PAGO: 'MERCADO_PAGO' } as const;
export type FeedProvider = (typeof FeedProvider)[keyof typeof FeedProvider];

export const FeedStatus = {
  /** Authorized; the platin account is not chosen yet. */
  NEEDS_ACCOUNT: 'NEEDS_ACCOUNT',
  ACTIVE: 'ACTIVE',
  /** The renewal failed or the person revoked the permission. */
  NEEDS_RECONNECT: 'NEEDS_RECONNECT',
} as const;
export type FeedStatus = (typeof FeedStatus)[keyof typeof FeedStatus];

export const ExternalMovementKind = {
  /** Money into the balance. */
  INCOME: 'INCOME',
  /** Money out of the balance. */
  EXPENSE: 'EXPENSE',
  /** Yield of the balance. */
  YIELD: 'YIELD',
  /** From the balance to a reserve. */
  RESERVE_IN: 'RESERVE_IN',
  /** From a reserve to the balance. */
  RESERVE_OUT: 'RESERVE_OUT',
  /** Buying or selling a currency inside the account: both amounts. */
  FX: 'FX',
  /** Refund of a movement: money in or out, the opposite of the original. */
  REFUND: 'REFUND',
} as const;
export type ExternalMovementKind = (typeof ExternalMovementKind)[keyof typeof ExternalMovementKind];
export const EXTERNAL_MOVEMENT_KINDS = Object.values(ExternalMovementKind);

export const ExternalMovementStatus = {
  APPLIED: 'APPLIED',
  LINKED: 'LINKED',
  HELD: 'HELD',
  /** The person deleted what it created: it never comes in again. */
  DISMISSED: 'DISMISSED',
} as const;
export type ExternalMovementStatus =
  (typeof ExternalMovementStatus)[keyof typeof ExternalMovementStatus];

/** Why a movement waits in "Para revisar" (MPG-09). */
export const FeedHoldReason = {
  RESERVE_NOT_MAPPED: 'RESERVE_NOT_MAPPED',
  CURRENCY_NOT_ENABLED: 'CURRENCY_NOT_ENABLED',
  NO_BALANCE_IN_CURRENCY: 'NO_BALANCE_IN_CURRENCY',
  NO_ACCOUNT: 'NO_ACCOUNT',
} as const;
export type FeedHoldReason = (typeof FeedHoldReason)[keyof typeof FeedHoldReason];
export const FEED_HOLD_REASONS = Object.values(FeedHoldReason);

/** "Ya lo cargaste": up to this many days before or after (MPG-06). */
export const DUPLICATE_WINDOW_DAYS = 2;
/** The longest reason platin keeps, as in a movement loaded by hand. */
const MAX_DESCRIPTION = 120;

/** A movement as the provider reports it, already normalized. */
export interface ExternalMovementInput {
  /** The provider's id: a movement is processed once (webhook and sync). */
  externalId: string;
  kind: ExternalMovementKind;
  /** Net, positive, 2 decimals ("3500.00"). For FX, what left. */
  amount: string;
  currency: Currency;
  /** FX only: what came in, in the other currency. */
  amountIn?: string | null;
  currencyIn?: Currency | null;
  /** The day it happened, in Argentina. */
  date: LocalDate;
  /** ISO instant, to order the movements of a day. */
  occurredAt: string;
  /** The merchant or the counterpart. */
  description: string;
  /** RESERVE_IN / RESERVE_OUT: the provider's reserve. */
  externalReserveId?: string | null;
  /** The reserve's name in the institution, to show it when assigning it. */
  reserveName?: string | null;
  /** REFUND: which way the money goes (into the balance for a refunded payment). */
  direction?: 'IN' | 'OUT' | null;
  /** REFUND: the provider's id of the refunded movement. */
  refundOf?: string | null;
}

/** Something already loaded that a movement could be (MPG-06). */
export interface DuplicateCandidate {
  kind: 'TRANSACTION' | 'TRANSFER';
  id: string;
  /** Seen from the account balance: an income or a transfer in is IN. */
  direction: 'IN' | 'OUT';
  amount: string;
  currency: Currency;
  date: LocalDate;
  /** ISO instant it was loaded: the older wins a tie. */
  createdAt: string;
}

export interface FeedPocket {
  id: string;
  kind: PocketKind;
  currency: Currency;
}

export interface FeedReserveMapping {
  externalReserveId: string;
  /** The platin reserve; null until the person assigns it. */
  pocketId: string | null;
}

export interface FeedPlanContext {
  /** The connected platin account; null when it is missing or archived. */
  accountId: string | null;
  /** Active pockets of that account. */
  pockets: readonly FeedPocket[];
  enabledCurrencies: readonly Currency[];
  reserves: readonly FeedReserveMapping[];
  /** Loaded movements of the account balance in the window, without a link. */
  candidates: readonly DuplicateCandidate[];
  rules: readonly TextEntryRule[];
  globalRules: readonly TextEntryGlobalRule[];
  /** Active categories the person can pick. */
  categories: readonly TextEntryCategory[];
  /** The system category Rendimientos (MPG-03). */
  yieldCategoryId: string | null;
  /** REFUND: the refunded movement, when it came in before. */
  refunded?: { description: string } | null;
  /** Created from the feed on the movement's day. */
  usedOnDay: number;
  /** `maxFeedMovementsPerDay` of the plan; null = no limit. */
  limit: number | null;
}

export type FeedPlan =
  | {
      action: 'CREATE_TRANSACTION';
      type: 'INCOME' | 'EXPENSE';
      pocketId: string;
      categoryId: string | null;
      description: string;
    }
  | {
      action: 'CREATE_TRANSFER';
      fromPocketId: string;
      toPocketId: string;
      amountOut: string;
      amountIn: string;
      description: string;
    }
  | { action: 'LINK'; transactionId: string }
  | { action: 'LINK'; transferId: string }
  | { action: 'HOLD'; reason: FeedHoldReason }
  | { action: 'OVER_LIMIT' };

/** MPG-07: whether one more movement fits the day. `null` = no limit; 0 lets nothing in. */
export function checkDailyLimit(limit: number | null, usedOnDay: number): boolean {
  return limit === null || usedOnDay < limit;
}

/** Which way a movement moves the account balance; null for reserves and currency changes. */
export function directionOf(movement: ExternalMovementInput): 'IN' | 'OUT' | null {
  switch (movement.kind) {
    case 'INCOME':
    case 'YIELD':
      return 'IN';
    case 'EXPENSE':
      return 'OUT';
    case 'REFUND':
      return movement.direction ?? null;
    default:
      return null;
  }
}

/**
 * MPG-06, "Ya lo cargaste": same account and currency (the caller only sends those), same way,
 * the exact amount, up to 2 days before or after. Several: the closest date; on a tie, the
 * older date, and then the one loaded first.
 */
export function findDuplicate(
  movement: ExternalMovementInput,
  candidates: readonly DuplicateCandidate[],
): DuplicateCandidate | null {
  const direction = directionOf(movement);
  if (!direction) return null;
  const amount = Money.of(movement.amount, movement.currency);
  const matching = candidates.filter(
    (candidate) =>
      candidate.direction === direction &&
      candidate.currency === movement.currency &&
      Money.of(candidate.amount, candidate.currency).equals(amount) &&
      Math.abs(daysBetween(movement.date, candidate.date)) <= DUPLICATE_WINDOW_DAYS,
  );
  matching.sort(
    (a, b) =>
      Math.abs(daysBetween(movement.date, a.date)) - Math.abs(daysBetween(movement.date, b.date)) ||
      compareDates(a.date, b.date) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return matching[0] ?? null;
}

/** The reason of a movement as platin shows it: a refund names what it refunds. */
export function feedDescription(
  movement: ExternalMovementInput,
  refunded?: { description: string } | null,
): string {
  const base = movement.description.trim();
  const text =
    movement.kind === 'REFUND' ? `Devolución: ${(refunded?.description ?? base).trim()}` : base;
  return text.slice(0, MAX_DESCRIPTION).trim();
}

/** The first word of a reason, normalized: the rule platin offers when categorizing (MPG-04). */
export function suggestedRulePattern(description: string): string | null {
  const word = normalizeText(description)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .trim()
    .split(' ')[0];
  return word && word.length >= 2 ? word : null;
}

function available(context: FeedPlanContext, currency: Currency): FeedPocket | undefined {
  return context.pockets.find(
    (pocket) => pocket.kind === 'AVAILABLE' && pocket.currency === currency,
  );
}

/**
 * What a movement becomes (the "Mercado Pago" rule). In this order: what cannot be placed
 * waits in "Para revisar"; an income or expense already loaded is linked; past the plan's daily
 * limit nothing is created; otherwise an income, an expense or a transfer.
 */
export function planExternalMovement(
  movement: ExternalMovementInput,
  context: FeedPlanContext,
): FeedPlan {
  if (!context.accountId) return { action: 'HOLD', reason: 'NO_ACCOUNT' };
  const currencies =
    movement.kind === 'FX' && movement.currencyIn
      ? [movement.currency, movement.currencyIn]
      : [movement.currency];
  if (currencies.some((currency) => !context.enabledCurrencies.includes(currency))) {
    return { action: 'HOLD', reason: 'CURRENCY_NOT_ENABLED' };
  }
  const balances = currencies.map((currency) => available(context, currency));
  if (balances.some((pocket) => !pocket)) {
    return { action: 'HOLD', reason: 'NO_BALANCE_IN_CURRENCY' };
  }
  const balance = balances[0] as FeedPocket;
  const description = feedDescription(movement, context.refunded);

  // Reserves: assigned once to a reserve of the same account and currency.
  let reserve: FeedPocket | undefined;
  if (movement.kind === 'RESERVE_IN' || movement.kind === 'RESERVE_OUT') {
    const mapping = context.reserves.find(
      (item) => item.externalReserveId === movement.externalReserveId,
    );
    reserve = context.pockets.find(
      (pocket) =>
        pocket.id === mapping?.pocketId &&
        pocket.kind !== 'AVAILABLE' &&
        pocket.currency === movement.currency,
    );
    if (!reserve) return { action: 'HOLD', reason: 'RESERVE_NOT_MAPPED' };
  }
  if (movement.kind === 'FX' && (!movement.amountIn || !movement.currencyIn)) {
    // A currency change without the other side cannot be a transfer: someone has to look at it.
    return { action: 'HOLD', reason: 'NO_BALANCE_IN_CURRENCY' };
  }

  const duplicate = findDuplicate(movement, context.candidates);
  if (duplicate) {
    return duplicate.kind === 'TRANSACTION'
      ? { action: 'LINK', transactionId: duplicate.id }
      : { action: 'LINK', transferId: duplicate.id };
  }

  if (!checkDailyLimit(context.limit, context.usedOnDay)) return { action: 'OVER_LIMIT' };

  switch (movement.kind) {
    case 'RESERVE_IN':
    case 'RESERVE_OUT': {
      const target = reserve as FeedPocket;
      const into = movement.kind === 'RESERVE_IN';
      return {
        action: 'CREATE_TRANSFER',
        fromPocketId: into ? balance.id : target.id,
        toPocketId: into ? target.id : balance.id,
        amountOut: movement.amount,
        amountIn: movement.amount,
        description,
      };
    }
    case 'FX':
      return {
        action: 'CREATE_TRANSFER',
        fromPocketId: balance.id,
        toPocketId: (balances[1] as FeedPocket).id,
        amountOut: movement.amount,
        amountIn: movement.amountIn as string,
        description,
      };
    case 'YIELD':
      return {
        action: 'CREATE_TRANSACTION',
        type: 'INCOME',
        pocketId: balance.id,
        categoryId: context.yieldCategoryId,
        description,
      };
    default: {
      // A refund without a direction is money back: an income.
      const type = directionOf(movement) === 'OUT' ? 'EXPENSE' : 'INCOME';
      const kind: CategoryKind = type;
      return {
        action: 'CREATE_TRANSACTION',
        type,
        pocketId: balance.id,
        categoryId: categoryByMerchantRules(
          movement.kind === 'REFUND'
            ? (context.refunded?.description ?? movement.description)
            : movement.description,
          kind,
          context,
        ),
        description,
      };
    }
  }
}
