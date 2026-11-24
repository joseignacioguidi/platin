import { ExternalMovementKind, FeedHoldReason, FeedProvider, FeedStatus } from '@platin/domain';
import { z } from 'zod';
import { currencySchema, uuidSchema } from './common';

export const feedProviderSchema = z.enum([FeedProvider.MERCADO_PAGO]);
export const feedStatusSchema = z.enum([
  FeedStatus.NEEDS_ACCOUNT,
  FeedStatus.ACTIVE,
  FeedStatus.NEEDS_RECONNECT,
]);
export const externalMovementKindSchema = z.enum(ExternalMovementKind);
export const feedHoldReasonSchema = z.enum(FeedHoldReason);

/** The URL segment of each provider: /feeds/mercado-pago/... */
export const FEED_PROVIDER_SLUGS: Record<FeedProvider, string> = {
  MERCADO_PAGO: 'mercado-pago',
};

/** MPG-07: what the feed created today and what was left out by the plan. */
export const feedUsageSchema = z.object({
  day: z.string(),
  created: z.number().int(),
  overLimit: z.number().int(),
  /** `null` = no limit. */
  limit: z.number().int().nullable(),
  planName: z.string(),
});

export const feedConnectionSchema = z.object({
  status: feedStatusSchema,
  account: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  connectedAt: z.string(),
  lastEventAt: z.string().nullable(),
  /** "Para revisar" (MPG-09). */
  heldCount: z.number().int(),
  /** Reserves of the institution without a platin reserve yet (MPG-05). */
  unmappedReserves: z.number().int(),
});

/** GET /feeds: the enabled providers and the user's connection with each one. */
export const feedsResponseSchema = z.object({
  providers: z.array(
    z.object({
      provider: feedProviderSchema,
      slug: z.string(),
      connection: feedConnectionSchema.nullable(),
      usage: feedUsageSchema,
    }),
  ),
});

/** POST /feeds/:provider/connect: where the browser goes to authorize (MPG-01). */
export const feedConnectResponseSchema = z.object({ authorizationUrl: z.string() });

/** PATCH /feeds/:provider: which platin account is the institution's (MPG-01). */
export const updateFeedRequestSchema = z.object({ accountId: uuidSchema });

/** MPG-05: a reserve of the institution and the platin reserve it goes to. */
export const feedReserveSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  currency: currencySchema,
  pocket: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  /** Movements of this reserve waiting in "Para revisar". */
  heldCount: z.number().int(),
});

/** PUT /feeds/:provider/reserves/:id. */
export const assignFeedReserveRequestSchema = z.object({ pocketId: uuidSchema });

/** MPG-09: a movement waiting in "Para revisar", with what is missing. */
export const heldMovementSchema = z.object({
  id: uuidSchema,
  kind: externalMovementKindSchema,
  holdReason: feedHoldReasonSchema,
  amount: z.string(),
  currency: currencySchema,
  amountIn: z.string().nullable(),
  currencyIn: currencySchema.nullable(),
  date: z.string(),
  description: z.string(),
  reserve: z.object({ id: uuidSchema, name: z.string() }).nullable(),
});

/** POST /feeds/:provider/held/retry: how many were applied and how many still wait. */
export const retryHeldResponseSchema = z.object({
  applied: z.number().int(),
  held: z.number().int(),
});

/**
 * MPG-08: an income or expense that came from the institution is really money moved: to
 * (or from) another account of mine, or the payment of a card statement.
 */
export const convertTransactionRequestSchema = z
  .object({
    to: z.enum(['TRANSFER', 'CARD_PAYMENT']),
    /** TRANSFER: the other account (its balance in the movement currency). */
    toAccountId: uuidSchema.optional(),
    /** CARD_PAYMENT: the statement it paid. */
    statementId: uuidSchema.optional(),
  })
  .refine((body) => (body.to === 'TRANSFER' ? !!body.toAccountId : !!body.statementId), {
    message: 'Elegí la cuenta o el resumen',
    path: ['to'],
  });

export const convertTransactionResponseSchema = z.object({ transferId: uuidSchema });

/** POST /external-movements/:id/unlink: "No es el mismo" (MPG-06). */
export const unlinkExternalMovementResponseSchema = z.object({
  transactionId: uuidSchema.nullable(),
  transferId: uuidSchema.nullable(),
});

/** On a movement of the list: it came from (or was linked to) an institution. */
export const movementExternalSchema = z.object({
  id: uuidSchema,
  provider: feedProviderSchema,
  /** APPLIED: created by it. LINKED: loaded by the person, and it also came from there. */
  status: z.enum(['APPLIED', 'LINKED']),
});

export type FeedUsage = z.infer<typeof feedUsageSchema>;
export type FeedConnection = z.infer<typeof feedConnectionSchema>;
export type FeedsResponse = z.infer<typeof feedsResponseSchema>;
export type FeedConnectResponse = z.infer<typeof feedConnectResponseSchema>;
export type UpdateFeedRequest = z.infer<typeof updateFeedRequestSchema>;
export type FeedReserve = z.infer<typeof feedReserveSchema>;
export type AssignFeedReserveRequest = z.infer<typeof assignFeedReserveRequestSchema>;
export type HeldMovement = z.infer<typeof heldMovementSchema>;
export type RetryHeldResponse = z.infer<typeof retryHeldResponseSchema>;
export type ConvertTransactionRequest = z.infer<typeof convertTransactionRequestSchema>;
export type ConvertTransactionResponse = z.infer<typeof convertTransactionResponseSchema>;
export type UnlinkExternalMovementResponse = z.infer<typeof unlinkExternalMovementResponseSchema>;
export type MovementExternal = z.infer<typeof movementExternalSchema>;
