import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  ConvertTransactionRequest,
  FeedReserve,
  FeedsResponse,
  FeedUsage,
  HeldMovement,
} from '@platin/contracts';
import { FEED_PROVIDER_SLUGS } from '@platin/contracts';
import { isCardCurrency, type FeedProvider, utcToLocalDate } from '@platin/domain';
import { createHash, randomBytes } from 'node:crypto';
import { StatementsService } from '../cards/statements.service';
import { AppException } from '../common/app-exception';
import { ClockService } from '../common/clock.service';
import { date, money, toDbDate } from '../common/serialize';
import { AppConfig } from '../config/app-config';
import type { FeedConnection } from '../generated/prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { type AccountFeedProvider, FeedAuthError } from './account-feed-provider';
import { FeedIngestService } from './feed-ingest.service';
import {
  FEED_TX_TTL_MS,
  type FeedTransaction,
  FeedProviderRegistry,
} from './feed-provider.registry';
import { FeedTokenCipher } from './feed-token-cipher';

/** Where the app shows the connection, for the redirects after the callback. */
export const FEED_PROFILE_PATH = '/app/perfil/mercado-pago';

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** MPG-01, 05, 07, 08, 09, 10 from the profile and the movement detail. */
@Injectable()
export class FeedsService {
  private readonly logger = new Logger(FeedsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FeedProviderRegistry,
    private readonly cipher: FeedTokenCipher,
    private readonly ingest: FeedIngestService,
    private readonly plans: PlansService,
    private readonly statements: StatementsService,
    private readonly clock: ClockService,
    private readonly config: AppConfig,
  ) {}

  async list(userId: string): Promise<FeedsResponse> {
    const providers = [];
    for (const provider of this.registry.enabled()) {
      const connection = await this.prisma.feedConnection.findUnique({
        where: { userId_provider: { userId, provider: provider.provider } },
        include: { account: { select: { id: true, name: true, archivedAt: true } } },
      });
      let summary: FeedsResponse['providers'][number]['connection'] = null;
      if (connection) {
        const [heldCount, unmappedReserves] = await Promise.all([
          this.prisma.externalMovement.count({
            where: { connectionId: connection.id, status: 'HELD' },
          }),
          this.prisma.feedReserve.count({
            where: { connectionId: connection.id, pocketId: null },
          }),
        ]);
        const account =
          connection.account && !connection.account.archivedAt
            ? { id: connection.account.id, name: connection.account.name }
            : null;
        summary = {
          // An archived or deleted account is chosen again, like a fresh connection.
          status: connection.status === 'ACTIVE' && !account ? 'NEEDS_ACCOUNT' : connection.status,
          account,
          connectedAt: connection.connectedAt.toISOString(),
          lastEventAt: connection.lastEventAt?.toISOString() ?? null,
          heldCount,
          unmappedReserves,
        };
      }
      providers.push({
        provider: provider.provider,
        slug: FEED_PROVIDER_SLUGS[provider.provider],
        connection: summary,
        usage: await this.usage(userId),
      });
    }
    return { providers };
  }

  /** MPG-01: the transaction for the feed_tx cookie and where the browser goes. */
  async connect(
    userId: string,
    slug: string,
  ): Promise<{ authorizationUrl: string; transaction: FeedTransaction }> {
    const provider = this.registry.bySlug(slug);
    const transaction: FeedTransaction = {
      provider: provider.provider,
      state: randomToken(),
      codeVerifier: randomToken(),
      userId,
      expiresAt: this.clock.now().getTime() + FEED_TX_TTL_MS,
    };
    const authorizationUrl = provider.buildAuthorizationUrl({
      state: transaction.state,
      codeChallenge: createHash('sha256').update(transaction.codeVerifier).digest('base64url'),
      redirectUri: this.redirectUri(slug),
    });
    return { authorizationUrl, transaction };
  }

  /**
   * MPG-01: back from the institution. Only the browser that started it (the feed_tx cookie)
   * can finish it, and an institution account already connected to someone else is refused.
   */
  async callback(
    slug: string,
    query: { code?: string; state?: string; error?: string },
    transaction: FeedTransaction | undefined,
  ): Promise<void> {
    const provider = this.registry.bySlug(slug);
    if (query.error) {
      throw new AppException('FEED_DENIED', HttpStatus.BAD_REQUEST, 'The authorization was denied');
    }
    if (
      !transaction ||
      transaction.provider !== provider.provider ||
      transaction.expiresAt < this.clock.now().getTime() ||
      !query.state ||
      query.state !== transaction.state ||
      !query.code
    ) {
      throw new AppException('FEED_STATE_MISMATCH', HttpStatus.BAD_REQUEST, 'Invalid connection');
    }
    const user = await this.prisma.user.findUnique({ where: { id: transaction.userId } });
    if (!user || user.status === 'SUSPENDED') {
      throw new AppException('FEED_STATE_MISMATCH', HttpStatus.BAD_REQUEST, 'Invalid connection');
    }
    let tokens;
    try {
      tokens = await provider.exchangeCode({
        code: query.code,
        codeVerifier: transaction.codeVerifier,
        redirectUri: this.redirectUri(slug),
      });
    } catch (error) {
      if (error instanceof FeedAuthError) {
        throw new AppException('FEED_DENIED', HttpStatus.BAD_REQUEST, 'The code was rejected');
      }
      throw error;
    }
    await this.saveConnection(user.id, provider, tokens);
  }

  private async saveConnection(
    userId: string,
    provider: AccountFeedProvider,
    tokens: Awaited<ReturnType<AccountFeedProvider['exchangeCode']>>,
  ): Promise<void> {
    const credentials = {
      accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt,
    };
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const taken = await tx.feedConnection.findUnique({
        where: {
          provider_externalUserId: {
            provider: provider.provider,
            externalUserId: tokens.externalUserId,
          },
        },
      });
      if (taken && taken.userId !== userId) {
        throw new AppException(
          'FEED_ACCOUNT_TAKEN',
          HttpStatus.CONFLICT,
          'That account is already connected to another platin user',
        );
      }
      const current = await tx.feedConnection.findUnique({
        where: { userId_provider: { userId, provider: provider.provider } },
      });
      if (!current) {
        await tx.feedConnection.create({
          data: {
            userId,
            provider: provider.provider,
            externalUserId: tokens.externalUserId,
            status: 'NEEDS_ACCOUNT',
            // Nothing before the connection comes in (the rule "Mercado Pago").
            cursor: now.toISOString(),
            connectedAt: now,
            ...credentials,
          },
        });
        return;
      }
      const sameAccount = current.externalUserId === tokens.externalUserId;
      if (!sameAccount) {
        // Another institution account: its reserves are not the old ones.
        await tx.feedReserve.deleteMany({ where: { connectionId: current.id } });
      }
      await tx.feedConnection.update({
        where: { id: current.id },
        data: {
          externalUserId: tokens.externalUserId,
          status: current.accountId ? 'ACTIVE' : 'NEEDS_ACCOUNT',
          // Reconnecting picks up where it stopped; another account starts now.
          cursor: sameAccount ? current.cursor : now.toISOString(),
          ...(sameAccount ? {} : { connectedAt: now }),
          ...credentials,
        },
      });
    });
  }

  /** MPG-01: which platin account (a wallet) is the institution's. */
  async setAccount(userId: string, slug: string, accountId: string): Promise<void> {
    const connection = await this.connectionOf(userId, slug);
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId, archivedAt: null },
    });
    if (!account) throw AppException.notFound('Account not found');
    if (account.kind !== 'WALLET') {
      throw new AppException(
        'FEED_ACCOUNT_KIND',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The connected account must be a wallet',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      if (connection.accountId !== accountId) {
        // Reserves pointed to the old account's reserves: they are assigned again.
        await tx.feedReserve.updateMany({
          where: { connectionId: connection.id },
          data: { pocketId: null },
        });
      }
      await tx.feedConnection.update({
        where: { id: connection.id },
        data: {
          accountId,
          status: connection.status === 'NEEDS_RECONNECT' ? 'NEEDS_RECONNECT' : 'ACTIVE',
        },
      });
    });
    await this.afterChange(userId, connection.id);
  }

  async reserves(userId: string, slug: string): Promise<FeedReserve[]> {
    const connection = await this.connectionOf(userId, slug);
    const rows = await this.prisma.feedReserve.findMany({
      where: { connectionId: connection.id },
      include: { pocket: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    const held = await this.prisma.externalMovement.groupBy({
      by: ['externalReserveId'],
      where: { connectionId: connection.id, status: 'HELD', externalReserveId: { not: null } },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency,
      pocket: row.pocket,
      heldCount:
        held.find((group) => group.externalReserveId === row.externalReserveId)?._count._all ?? 0,
    }));
  }

  /** MPG-05: assigns a reserve and applies, in order, what was waiting for it. */
  async assignReserve(
    userId: string,
    slug: string,
    reserveId: string,
    pocketId: string,
  ): Promise<void> {
    const connection = await this.connectionOf(userId, slug);
    const reserve = await this.prisma.feedReserve.findFirst({
      where: { id: reserveId, connectionId: connection.id },
    });
    if (!reserve) throw AppException.notFound('Reserve not found');
    const pocket = await this.prisma.pocket.findFirst({
      where: { id: pocketId, userId, archivedAt: null },
    });
    if (!pocket) throw AppException.notFound('Pocket not found');
    if (
      pocket.accountId !== connection.accountId ||
      pocket.kind === 'AVAILABLE' ||
      pocket.currency !== reserve.currency
    ) {
      throw new AppException(
        'FEED_RESERVE_POCKET',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Pick a reserve of the connected account in the same currency',
      );
    }
    await this.prisma.feedReserve.update({ where: { id: reserve.id }, data: { pocketId } });
    await this.afterChange(userId, connection.id);
  }

  async held(userId: string, slug: string): Promise<HeldMovement[]> {
    const connection = await this.connectionOf(userId, slug);
    const [rows, reserves] = await Promise.all([
      this.prisma.externalMovement.findMany({
        where: { connectionId: connection.id, status: 'HELD' },
        orderBy: [{ date: 'asc' }, { occurredAt: 'asc' }],
        take: 200,
      }),
      this.prisma.feedReserve.findMany({ where: { connectionId: connection.id } }),
    ]);
    return rows.map((row) => {
      const reserve = reserves.find((r) => r.externalReserveId === row.externalReserveId);
      return {
        id: row.id,
        kind: row.kind,
        holdReason: (row.holdReason ?? 'NO_ACCOUNT') as HeldMovement['holdReason'],
        amount: money(row.amount),
        currency: row.currency,
        amountIn: row.amountIn ? money(row.amountIn) : null,
        currencyIn: row.currencyIn,
        date: date(row.date),
        description: row.description,
        reserve: reserve ? { id: reserve.id, name: reserve.name } : null,
      };
    });
  }

  async retryHeld(userId: string, slug: string): Promise<{ applied: number; held: number }> {
    await this.connectionOf(userId, slug);
    return this.ingest.retryHeld(userId);
  }

  /** "Para revisar" the person does not want: it never comes in (DISMISSED). */
  async dismissHeld(userId: string, slug: string, id: string): Promise<void> {
    const connection = await this.connectionOf(userId, slug);
    const { count } = await this.prisma.externalMovement.updateMany({
      where: { id, connectionId: connection.id, status: 'HELD' },
      data: { status: 'DISMISSED', holdReason: null },
    });
    if (count === 0) throw AppException.notFound();
  }

  usageOf(userId: string, slug: string): Promise<FeedUsage> {
    this.registry.bySlug(slug);
    return this.usage(userId);
  }

  /** MPG-07: today's usage, with the plan's limit. */
  async usage(userId: string): Promise<FeedUsage> {
    const today = this.clock.today();
    const [row, plan] = await Promise.all([
      this.prisma.feedDailyUsage.findUnique({
        where: { userId_day: { userId, day: toDbDate(today) } },
      }),
      this.plans.current(userId),
    ]);
    return {
      day: today,
      created: row?.created ?? 0,
      overLimit: row?.overLimit ?? 0,
      limit: plan.limits.maxFeedMovementsPerDay,
      planName: plan.plan.name,
    };
  }

  /** MPG-10: credentials and reserves go; the movements that came in stay. */
  async disconnect(userId: string, slug: string): Promise<void> {
    const provider = this.registry.bySlug(slug);
    await this.prisma.feedConnection.deleteMany({
      where: { userId, provider: provider.provider },
    });
  }

  /** MPG-06: "No es el mismo". */
  async unlink(
    userId: string,
    id: string,
  ): Promise<{ transactionId: string | null; transferId: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.externalMovement.findFirst({ where: { id, userId } });
      if (!row) throw AppException.notFound();
      if (row.status !== 'LINKED') {
        throw new AppException(
          'NOT_LINKED',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'That movement is not linked to one already loaded',
        );
      }
      // Detach first, so the new movement is not linked to the same one again.
      await tx.externalMovement.update({
        where: { id: row.id },
        data: { transactionId: null, transferId: null },
      });
      return this.ingest.unlink(tx, { ...row, transactionId: null, transferId: null });
    });
  }

  /**
   * MPG-08: an income or expense that came from the institution was money moved: it becomes a
   * transfer to (or from) another account, or the payment of a card statement. The link moves
   * to the new transfer, so it never comes in again.
   */
  async convert(
    userId: string,
    transactionId: string,
    request: ConvertTransactionRequest,
  ): Promise<{ transferId: string }> {
    const row = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { external: true, pocket: true },
    });
    if (!row) throw AppException.notFound('Movement not found');
    const convertible =
      row.channel === 'MERCADO_PAGO' &&
      row.status === 'CONFIRMED' &&
      (row.type === 'INCOME' || row.type === 'EXPENSE') &&
      row.external?.status === 'APPLIED';
    if (!convertible || (request.to === 'CARD_PAYMENT' && row.type !== 'EXPENSE')) {
      throw new AppException(
        'NOT_CONVERTIBLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Only incomes and expenses that came from Mercado Pago can be converted',
      );
    }
    const day = utcToLocalDate(row.date);
    return this.prisma.$transaction(async (tx) => {
      let transferId: string;
      if (request.to === 'TRANSFER') {
        const toAccountId = request.toAccountId as string;
        const other = await tx.pocket.findFirst({
          where: {
            userId,
            accountId: toAccountId,
            kind: 'AVAILABLE',
            currency: row.currency,
            archivedAt: null,
            account: { archivedAt: null },
          },
        });
        if (!other) {
          const exists = await tx.account.findFirst({ where: { id: toAccountId, userId } });
          if (!exists) throw AppException.notFound('Account not found');
          throw new AppException(
            'NO_BALANCE_IN_CURRENCY',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'That account has no balance in the movement currency',
          );
        }
        if (other.id === row.pocketId) {
          throw new AppException(
            'NOT_CONVERTIBLE',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'Pick another account',
          );
        }
        const out = row.type === 'EXPENSE';
        const transfer = await tx.transfer.create({
          data: {
            userId,
            fromPocketId: out ? row.pocketId : other.id,
            toPocketId: out ? other.id : row.pocketId,
            amountOut: row.amount,
            amountIn: row.amount,
            currencyIn: row.currency,
            date: row.date,
            description: row.description,
          },
        });
        transferId = transfer.id;
      } else {
        if (!isCardCurrency(row.currency)) {
          throw new AppException(
            'CARD_CURRENCY',
            HttpStatus.UNPROCESSABLE_ENTITY,
            'Cards are paid in pesos or dollars',
          );
        }
        transferId = await this.statements.payIn(tx, userId, request.statementId as string, {
          pocketId: row.pocketId,
          currency: row.currency,
          amount: row.amount.toFixed(2),
          date: day,
        });
      }
      await tx.externalMovement.update({
        where: { id: (row.external as { id: string }).id },
        data: { transactionId: null, transferId },
      });
      await tx.transaction.delete({ where: { id: row.id } });
      return { transferId };
    });
  }

  /** The connection of the user with an enabled provider, or 404. */
  private async connectionOf(userId: string, slug: string): Promise<FeedConnection> {
    const provider = this.registry.bySlug(slug);
    const connection = await this.prisma.feedConnection.findUnique({
      where: { userId_provider: { userId, provider: provider.provider as FeedProvider } },
    });
    if (!connection) throw AppException.notFound('Not connected');
    return connection;
  }

  /** After the account or a reserve changes: what waited is applied, and what was missed read. */
  private async afterChange(userId: string, connectionId: string): Promise<void> {
    await this.ingest.retryHeld(userId);
    const connection = await this.prisma.feedConnection.findUnique({ where: { id: connectionId } });
    if (connection?.status !== 'ACTIVE') return;
    try {
      await this.ingest.syncConnection(connection);
    } catch (error) {
      this.logger.warn(
        `Feed sync after a change failed: ${error instanceof Error ? error.name : ''}`,
      );
    }
  }

  private redirectUri(slug: string): string {
    return `${this.config.env.PUBLIC_APP_URL ?? ''}/api/v1/feeds/${slug}/callback`;
  }
}
