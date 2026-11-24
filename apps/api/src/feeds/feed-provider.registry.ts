import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { FEED_PROVIDER_SLUGS } from '@platin/contracts';
import type { FeedProvider } from '@platin/domain';
import { z } from 'zod';
import { AppException } from '../common/app-exception';
import { AppConfig } from '../config/app-config';
import { type AccountFeedProvider, FEED_PROVIDERS } from './account-feed-provider';
import { MercadoPagoProvider } from './mercado-pago.provider';

export const FEED_TX_COOKIE = 'feed_tx';
export const FEED_TX_COOKIE_PATH = '/api/v1/feeds';
export const FEED_TX_TTL_MS = 10 * 60_000;

/**
 * A connection in progress (MPG-01), in the signed httpOnly feed_tx cookie set by POST /connect:
 * only a platin screen with a session can set it, so a foreign link connects nothing.
 */
export const feedTransactionSchema = z.object({
  provider: z.enum(['MERCADO_PAGO']),
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  userId: z.string().uuid(),
  expiresAt: z.number(),
});
export type FeedTransaction = z.infer<typeof feedTransactionSchema>;

/** A provider is enabled only when its environment variables are set. */
export function feedProvidersFromConfig(config: AppConfig): AccountFeedProvider[] {
  const { MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, MERCADOPAGO_WEBHOOK_SECRET } =
    config.env;
  return MERCADOPAGO_CLIENT_ID && MERCADOPAGO_CLIENT_SECRET && MERCADOPAGO_WEBHOOK_SECRET
    ? [
        new MercadoPagoProvider(
          MERCADOPAGO_CLIENT_ID,
          MERCADOPAGO_CLIENT_SECRET,
          MERCADOPAGO_WEBHOOK_SECRET,
        ),
      ]
    : [];
}

@Injectable()
export class FeedProviderRegistry {
  constructor(@Inject(FEED_PROVIDERS) private readonly providers: AccountFeedProvider[]) {}

  enabled(): AccountFeedProvider[] {
    return this.providers;
  }

  /** The enabled provider for a URL slug ("mercado-pago"), or FEED_PROVIDER_DISABLED (404). */
  bySlug(slug: string): AccountFeedProvider {
    const provider = this.providers.find((p) => FEED_PROVIDER_SLUGS[p.provider] === slug);
    if (!provider) {
      throw new AppException(
        'FEED_PROVIDER_DISABLED',
        HttpStatus.NOT_FOUND,
        'That connection is not enabled',
      );
    }
    return provider;
  }

  byProvider(provider: FeedProvider): AccountFeedProvider | undefined {
    return this.providers.find((p) => p.provider === provider);
  }
}
