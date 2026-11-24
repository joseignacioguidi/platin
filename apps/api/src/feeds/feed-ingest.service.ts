import { Injectable, Logger } from '@nestjs/common';
import {
  addDays,
  type Currency,
  type DuplicateCandidate,
  directionOf,
  type ExternalMovementInput,
  type FeedPlan,
  type FeedPlanContext,
  DUPLICATE_WINDOW_DAYS,
  parseLocalDate,
  planExternalMovement,
  utcToLocalDate,
} from '@platin/domain';
import { ClockService } from '../common/clock.service';
import { toDbDate } from '../common/serialize';
import type { ExternalMovement, FeedConnection, Prisma } from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TransactionsService } from '../transactions/transactions.service';
import { FeedAuthError } from './account-feed-provider';
import { FeedProviderRegistry } from './feed-provider.registry';
import { FeedTokenCipher } from './feed-token-cipher';

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The backup sync never reads further back than this. */
const SYNC_WINDOW_DAYS = 7;
/** Tokens are renewed when they expire in less than this. */
const REFRESH_BEFORE_DAYS = 30;
const WEBHOOK_EVENTS_KEPT_DAYS = 3;
/** Longer than the sync window, so a skipped id is never read again as new. */
const SKIPPED_KEPT_DAYS = SYNC_WINDOW_DAYS + 1;

/** What happened to one movement (for the logs and the tests; never amounts nor names). */
export type IngestOutcome =
  'APPLIED' | 'LINKED' | 'HELD' | 'OVER_LIMIT' | 'ALREADY_PROCESSED' | 'SKIPPED';

/** Turns a stored movement back into the provider's normalized input. */
export function inputOf(row: ExternalMovement, reserveName?: string | null): ExternalMovementInput {
  return {
    externalId: row.externalId,
    kind: row.kind,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    amountIn: row.amountIn ? row.amountIn.toFixed(2) : null,
    currencyIn: row.currencyIn,
    date: utcToLocalDate(row.date),
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    externalReserveId: row.externalReserveId,
    reserveName: reserveName ?? null,
    direction: row.direction === 'IN' || row.direction === 'OUT' ? row.direction : null,
    refundOf: row.refundOf,
  };
}

/**
 * Turns movements of a connected institution into platin movements (MPG-02 to 09). The webhook
 * and the backup sync share it; the unique (connectionId, externalId) keeps both paths from
 * creating anything twice, and each connection's row is locked while one of its movements is
 * processed, so the day's usage stays exact.
 */
@Injectable()
export class FeedIngestService {
  private readonly logger = new Logger(FeedIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
    private readonly registry: FeedProviderRegistry,
    private readonly cipher: FeedTokenCipher,
    private readonly clock: ClockService,
  ) {}

  /**
   * The movements of one notice (or one sync item), in a single transaction. With a request id
   * the webhook event is recorded in the same transaction: a repeated notice does nothing.
   */
  async ingest(
    connectionId: string,
    inputs: readonly ExternalMovementInput[],
    requestId?: string,
  ): Promise<IngestOutcome[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const connection = await this.lock(tx, connectionId);
        if (requestId) {
          const seen = await tx.feedWebhookEvent.findUnique({ where: { requestId } });
          if (seen) return inputs.map(() => 'ALREADY_PROCESSED' as const);
          await tx.feedWebhookEvent.create({ data: { requestId } });
        }
        if (!connection || connection.status !== 'ACTIVE')
          return inputs.map(() => 'SKIPPED' as const);
        const outcomes: IngestOutcome[] = [];
        for (const input of inputs) outcomes.push(await this.processNew(tx, connection, input));
        await tx.feedConnection.update({
          where: { id: connection.id },
          data: { lastEventAt: this.clock.now() },
        });
        return outcomes;
      },
      { timeout: 20_000 },
    );
  }

  /** A repeated notice of a topic platin ignores, or for a connection that is not active. */
  async recordEvent(requestId: string): Promise<boolean> {
    const result = await this.prisma.feedWebhookEvent.createMany({
      data: [{ requestId }],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  /**
   * MPG-09: tries again what waits in "Para revisar", oldest first, after something changed
   * (a reserve assigned, a currency enabled, the account chosen). Applying counts in the day's
   * limit then; past it, it is dropped like any movement over the limit.
   */
  async retryHeld(userId: string): Promise<{ applied: number; held: number }> {
    const rows = await this.prisma.externalMovement.findMany({
      where: { userId, status: 'HELD' },
      orderBy: [{ date: 'asc' }, { occurredAt: 'asc' }, { id: 'asc' }],
      select: { id: true, connectionId: true },
    });
    let applied = 0;
    for (const { id, connectionId } of rows) {
      try {
        const outcome = await this.prisma.$transaction(async (tx) => {
          const connection = await this.lock(tx, connectionId);
          const row = await tx.externalMovement.findUnique({ where: { id } });
          if (!connection || connection.status !== 'ACTIVE' || row?.status !== 'HELD')
            return 'HELD';
          return this.processHeld(tx, connection, row);
        });
        if (outcome !== 'HELD') applied += 1;
      } catch (error) {
        // A missing rate or the like: it keeps waiting and is tried again later.
        this.logger.warn(`Held movement ${id} could not be applied: ${describe(error)}`);
      }
    }
    const held = await this.prisma.externalMovement.count({ where: { userId, status: 'HELD' } });
    return { applied, held };
  }

  /**
   * MPG-06, "No es el mismo": the linked movement is created on its own, with what the
   * institution reported. The person asked for it, so the daily limit does not stop it (it
   * still counts as created).
   */
  async unlink(
    tx: Tx,
    row: ExternalMovement,
  ): Promise<{ transactionId: string | null; transferId: string | null }> {
    const connection = await this.lock(tx, row.connectionId);
    if (!connection) return { transactionId: null, transferId: null };
    const input = inputOf(row);
    const context = await this.contextFor(tx, connection, input);
    const plan = planExternalMovement(input, { ...context, candidates: [], limit: null });
    const result = await this.execute(tx, connection, input, plan);
    await tx.externalMovement.update({
      where: { id: row.id },
      data: {
        status: result.status === 'OVER_LIMIT' ? 'HELD' : result.status,
        holdReason: result.holdReason,
        transactionId: result.transactionId,
        transferId: result.transferId,
      },
    });
    return { transactionId: result.transactionId, transferId: result.transferId };
  }

  /**
   * POST /sync for one user: renews tokens about to expire, reads what happened since the last
   * cursor (at most 7 days), retries "Para revisar" and cleans old rows. Never throws: the app
   * opening must not fail because an institution is down.
   */
  async syncUser(userId: string): Promise<void> {
    const connections = await this.prisma.feedConnection.findMany({
      where: { userId, status: 'ACTIVE' },
    });
    for (const connection of connections) {
      try {
        await this.syncConnection(connection);
      } catch (error) {
        this.logger.warn(`Feed sync failed for connection ${connection.id}: ${describe(error)}`);
      }
    }
    try {
      if (connections.length > 0) await this.retryHeld(userId);
      await this.cleanup();
    } catch (error) {
      this.logger.warn(`Feed retry failed: ${describe(error)}`);
    }
  }

  async syncConnection(connection: FeedConnection): Promise<void> {
    const provider = this.registry.byProvider(connection.provider);
    if (!provider || !connection.accessTokenEnc) return;
    let accessToken = this.cipher.decrypt(connection.accessTokenEnc);
    const now = this.clock.now();
    try {
      const expiresSoon =
        connection.tokenExpiresAt &&
        connection.tokenExpiresAt.getTime() - now.getTime() < REFRESH_BEFORE_DAYS * DAY_MS;
      if (expiresSoon && connection.refreshTokenEnc) {
        const tokens = await provider.refresh(this.cipher.decrypt(connection.refreshTokenEnc));
        accessToken = tokens.accessToken;
        await this.prisma.feedConnection.update({
          where: { id: connection.id },
          data: {
            accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
            refreshTokenEnc: tokens.refreshToken
              ? this.cipher.encrypt(tokens.refreshToken)
              : connection.refreshTokenEnc,
            tokenExpiresAt: tokens.expiresAt,
          },
        });
      }
      const since = new Date(now.getTime() - SYNC_WINDOW_DAYS * DAY_MS);
      const { movements, cursor } = await provider.listSince(
        accessToken,
        connection.cursor,
        since,
        connection.externalUserId,
      );
      let failed = false;
      for (const movement of movements) {
        try {
          await this.ingest(connection.id, [movement]);
        } catch (error) {
          failed = true;
          this.logger.warn(`Feed movement ${movement.externalId} failed: ${describe(error)}`);
        }
      }
      // A failed movement keeps the cursor, so the next sync reads it again.
      if (!failed) {
        await this.prisma.feedConnection.update({ where: { id: connection.id }, data: { cursor } });
      }
    } catch (error) {
      if (error instanceof FeedAuthError) await this.needsReconnect(connection.id);
      else throw error;
    }
  }

  /** MPG-10: the authorization expired or was revoked. Credentials go; what came in stays. */
  async needsReconnect(connectionId: string): Promise<void> {
    await this.prisma.feedConnection.updateMany({
      where: { id: connectionId },
      data: {
        status: 'NEEDS_RECONNECT',
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
      },
    });
  }

  private async cleanup(): Promise<void> {
    const now = this.clock.now().getTime();
    await this.prisma.feedWebhookEvent.deleteMany({
      where: { receivedAt: { lt: new Date(now - WEBHOOK_EVENTS_KEPT_DAYS * DAY_MS) } },
    });
    await this.prisma.feedSkippedMovement.deleteMany({
      where: { createdAt: { lt: new Date(now - SKIPPED_KEPT_DAYS * DAY_MS) } },
    });
  }

  private async lock(tx: Tx, connectionId: string): Promise<FeedConnection | null> {
    await tx.$queryRaw`SELECT id FROM "FeedConnection" WHERE id = ${connectionId}::uuid FOR UPDATE`;
    return tx.feedConnection.findUnique({ where: { id: connectionId } });
  }

  private async processNew(
    tx: Tx,
    connection: FeedConnection,
    input: ExternalMovementInput,
  ): Promise<IngestOutcome> {
    const key = { connectionId: connection.id, externalId: input.externalId };
    const [existing, skipped, user] = await Promise.all([
      tx.externalMovement.findUnique({ where: { connectionId_externalId: key } }),
      tx.feedSkippedMovement.findUnique({ where: { connectionId_externalId: key } }),
      tx.user.findUniqueOrThrow({ where: { id: connection.userId }, select: { status: true } }),
    ]);
    if (existing || skipped) return 'ALREADY_PROCESSED';
    // A suspended user receives nothing, now or later (the rule "Conexión").
    if (user.status === 'SUSPENDED') {
      await tx.feedSkippedMovement.create({ data: { ...key, day: toDbDate(input.date) } });
      return 'SKIPPED';
    }
    const context = await this.contextFor(tx, connection, input);
    const plan = planExternalMovement(input, context);
    const result = await this.execute(tx, connection, input, plan);
    if (result.status === 'OVER_LIMIT') return 'OVER_LIMIT';
    await tx.externalMovement.create({
      data: {
        userId: connection.userId,
        connectionId: connection.id,
        externalId: input.externalId,
        kind: input.kind,
        status: result.status,
        holdReason: result.holdReason,
        amount: input.amount,
        amountIn: input.amountIn ?? null,
        currency: input.currency,
        currencyIn: input.currencyIn ?? null,
        date: toDbDate(input.date),
        occurredAt: new Date(input.occurredAt),
        description: input.description.slice(0, 200),
        externalReserveId: input.externalReserveId ?? null,
        direction: input.direction ?? null,
        refundOf: input.refundOf ?? null,
        transactionId: result.transactionId,
        transferId: result.transferId,
      },
    });
    return result.status;
  }

  private async processHeld(
    tx: Tx,
    connection: FeedConnection,
    row: ExternalMovement,
  ): Promise<IngestOutcome> {
    const input = inputOf(row);
    const plan = planExternalMovement(input, await this.contextFor(tx, connection, input));
    const result = await this.execute(tx, connection, input, plan);
    if (result.status === 'OVER_LIMIT') {
      // Over the limit nothing is kept (MPG-07): the held row goes, only its id stays.
      await tx.externalMovement.delete({ where: { id: row.id } });
      return 'OVER_LIMIT';
    }
    await tx.externalMovement.update({
      where: { id: row.id },
      data: {
        status: result.status,
        holdReason: result.holdReason,
        transactionId: result.transactionId,
        transferId: result.transferId,
      },
    });
    return result.status;
  }

  /** Writes what the plan says and returns how to record the movement. */
  private async execute(
    tx: Tx,
    connection: FeedConnection,
    input: ExternalMovementInput,
    plan: FeedPlan,
  ): Promise<{
    status: 'APPLIED' | 'LINKED' | 'HELD' | 'OVER_LIMIT';
    holdReason: string | null;
    transactionId: string | null;
    transferId: string | null;
  }> {
    const none = { holdReason: null, transactionId: null, transferId: null };
    const day = toDbDate(input.date);
    const userId = connection.userId;
    switch (plan.action) {
      case 'HOLD':
        return { ...none, status: 'HELD', holdReason: plan.reason };
      case 'LINK':
        return 'transactionId' in plan
          ? { ...none, status: 'LINKED', transactionId: plan.transactionId }
          : { ...none, status: 'LINKED', transferId: plan.transferId };
      case 'OVER_LIMIT':
        await tx.feedSkippedMovement.createMany({
          data: [{ connectionId: connection.id, externalId: input.externalId, day }],
          skipDuplicates: true,
        });
        await tx.feedDailyUsage.upsert({
          where: { userId_day: { userId, day } },
          create: { userId, day, overLimit: 1 },
          update: { overLimit: { increment: 1 } },
        });
        return { ...none, status: 'OVER_LIMIT' };
      case 'CREATE_TRANSACTION': {
        const transactionId = await this.transactions.createFromFeedIn(tx, userId, {
          pocketId: plan.pocketId,
          categoryId: plan.categoryId,
          type: plan.type,
          amount: input.amount,
          currency: input.currency,
          date: input.date,
          description: plan.description,
        });
        await this.countCreated(tx, userId, day);
        return { ...none, status: 'APPLIED', transactionId };
      }
      case 'CREATE_TRANSFER': {
        const to = await tx.pocket.findUniqueOrThrow({ where: { id: plan.toPocketId } });
        const transfer = await tx.transfer.create({
          data: {
            userId,
            fromPocketId: plan.fromPocketId,
            toPocketId: plan.toPocketId,
            amountOut: plan.amountOut,
            amountIn: plan.amountIn,
            currencyIn: to.currency,
            date: day,
            description: plan.description || null,
          },
        });
        await this.countCreated(tx, userId, day);
        return { ...none, status: 'APPLIED', transferId: transfer.id };
      }
    }
  }

  private async countCreated(tx: Tx, userId: string, day: Date): Promise<void> {
    await tx.feedDailyUsage.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, created: 1 },
      update: { created: { increment: 1 } },
    });
  }

  /** Everything planExternalMovement needs, read inside the transaction. */
  private async contextFor(
    tx: Tx,
    connection: FeedConnection,
    input: ExternalMovementInput,
  ): Promise<FeedPlanContext> {
    const userId = connection.userId;
    const account = connection.accountId
      ? await tx.account.findFirst({
          where: { id: connection.accountId, userId, archivedAt: null },
        })
      : null;
    const [user, pockets, rules, global, categories, yieldCategory, usage, plan] =
      await Promise.all([
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { currencies: true } }),
        account
          ? tx.pocket.findMany({
              where: { accountId: account.id, archivedAt: null },
              select: { id: true, kind: true, currency: true },
            })
          : [],
        tx.merchantRule.findMany({
          where: { userId, category: { archivedAt: null } },
          select: { pattern: true, categoryId: true },
        }),
        this.settings.value('merchant-rules', tx),
        tx.category.findMany({
          where: { userId, archivedAt: null, systemKey: null },
          select: { id: true, name: true, kind: true },
        }),
        tx.category.findFirst({ where: { userId, systemKey: 'YIELD' }, select: { id: true } }),
        tx.feedDailyUsage.findUnique({
          where: { userId_day: { userId, day: toDbDate(input.date) } },
        }),
        this.plans.current(userId, tx),
      ]);

    const reserves = [];
    if (input.externalReserveId) {
      const reserve = await tx.feedReserve.upsert({
        where: {
          connectionId_externalReserveId: {
            connectionId: connection.id,
            externalReserveId: input.externalReserveId,
          },
        },
        create: {
          connectionId: connection.id,
          externalReserveId: input.externalReserveId,
          name: (input.reserveName ?? 'Reserva').slice(0, 60),
          currency: input.currency,
        },
        update: input.reserveName ? { name: input.reserveName.slice(0, 60) } : {},
      });
      reserves.push({ externalReserveId: reserve.externalReserveId, pocketId: reserve.pocketId });
    }

    const refunded = input.refundOf
      ? await tx.externalMovement.findUnique({
          where: {
            connectionId_externalId: { connectionId: connection.id, externalId: input.refundOf },
          },
          select: { description: true },
        })
      : null;

    const balance = pockets.find((p) => p.kind === 'AVAILABLE' && p.currency === input.currency);
    const candidates =
      balance && directionOf(input) ? await this.candidates(tx, userId, balance.id, input) : [];

    return {
      accountId: account?.id ?? null,
      pockets,
      enabledCurrencies: user.currencies,
      reserves,
      candidates,
      rules,
      globalRules: global.rules,
      categories,
      yieldCategoryId: yieldCategory?.id ?? null,
      refunded,
      usedOnDay: usage?.created ?? 0,
      limit: plan.limits.maxFeedMovementsPerDay,
    };
  }

  /**
   * "Ya lo cargaste": confirmed incomes and expenses of that balance, and transfers (statement
   * payments included) that leave or enter it, in the ±2 days window and without a link.
   */
  private async candidates(
    tx: Tx,
    userId: string,
    pocketId: string,
    input: ExternalMovementInput,
  ): Promise<DuplicateCandidate[]> {
    const date = {
      gte: toDbDate(addDays(input.date, -DUPLICATE_WINDOW_DAYS)),
      lte: toDbDate(addDays(input.date, DUPLICATE_WINDOW_DAYS)),
    };
    const [transactions, transfers] = await Promise.all([
      tx.transaction.findMany({
        where: {
          userId,
          pocketId,
          date,
          status: 'CONFIRMED',
          type: { in: ['INCOME', 'EXPENSE'] },
          external: null,
          amount: input.amount,
        },
        select: { id: true, type: true, amount: true, currency: true, date: true, createdAt: true },
      }),
      tx.transfer.findMany({
        where: {
          userId,
          date,
          external: null,
          OR: [
            { fromPocketId: pocketId, amountOut: input.amount },
            { toPocketId: pocketId, amountIn: input.amount },
          ],
        },
        select: {
          id: true,
          fromPocketId: true,
          amountOut: true,
          amountIn: true,
          date: true,
          createdAt: true,
        },
      }),
    ]);
    const currency: Currency = input.currency;
    return [
      ...transactions.map((row) => ({
        kind: 'TRANSACTION' as const,
        id: row.id,
        direction: row.type === 'INCOME' ? ('IN' as const) : ('OUT' as const),
        amount: row.amount.toFixed(2),
        currency: row.currency,
        date: parseLocalDate(utcToLocalDate(row.date)),
        createdAt: row.createdAt.toISOString(),
      })),
      ...transfers.map((row) => {
        const out = row.fromPocketId === pocketId;
        return {
          kind: 'TRANSFER' as const,
          id: row.id,
          direction: out ? ('OUT' as const) : ('IN' as const),
          amount: (out ? row.amountOut : row.amountIn).toFixed(2),
          currency,
          date: utcToLocalDate(row.date),
          createdAt: row.createdAt.toISOString(),
        };
      }),
    ];
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}
