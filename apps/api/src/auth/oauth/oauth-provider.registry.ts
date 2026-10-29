import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUTH_PROVIDER_SLUGS, AuthProvider } from '@platin/contracts';
import { AppException } from '../../common/app-exception';
import { AppConfig } from '../../config/app-config';
import { GoogleProvider } from './google.provider';
import { OAUTH_PROVIDERS, OAuthProvider } from './oauth-provider';

/** A provider is enabled only when its environment variables are set. */
export function providersFromConfig(config: AppConfig): OAuthProvider[] {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = config.env;
  return GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? [new GoogleProvider(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)]
    : [];
}

@Injectable()
export class OAuthProviderRegistry {
  constructor(@Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProvider[]) {}

  enabled(): { provider: AuthProvider; slug: string }[] {
    return this.providers.map(({ provider }) => ({
      provider,
      slug: AUTH_PROVIDER_SLUGS[provider],
    }));
  }

  /** The enabled provider for a URL slug ("google"), or OAUTH_PROVIDER_DISABLED. */
  bySlug(slug: string): OAuthProvider {
    const provider = this.providers.find((p) => AUTH_PROVIDER_SLUGS[p.provider] === slug);
    if (!provider) {
      throw new AppException(
        'OAUTH_PROVIDER_DISABLED',
        HttpStatus.NOT_FOUND,
        'That sign-in provider is not enabled',
      );
    }
    return provider;
  }
}
