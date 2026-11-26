import { Global, Module } from '@nestjs/common';
import { ClockService } from '../common/clock.service';
import { AppConfig } from '../config/app-config';
import { ArgentinaDatosProvider } from './argentinadatos.provider';
import { CoinGeckoProvider } from './coingecko.provider';
import { Data912Provider } from './data912.provider';
import { InstrumentsController } from './instruments.controller';
import { PRICE_PROVIDERS, type PriceProvider } from './price-provider';
import { PricesService } from './prices.service';

/** The sources this deployment uses: a source with an empty URL is off (ADR 0041). */
export function priceProvidersFromConfig(config: AppConfig, clock: ClockService): PriceProvider[] {
  const env = config.env;
  const providers: PriceProvider[] = [];
  const today = () => clock.today();
  if (env.PRICES_ARGENTINADATOS_URL) {
    providers.push(new ArgentinaDatosProvider(env.PRICES_ARGENTINADATOS_URL, today));
  }
  if (env.PRICES_DATA912_URL) providers.push(new Data912Provider(env.PRICES_DATA912_URL, today));
  if (env.PRICES_COINGECKO_URL) {
    providers.push(
      new CoinGeckoProvider(env.PRICES_COINGECKO_URL, today, env.COINGECKO_API_KEY || undefined),
    );
  }
  return providers;
}

/**
 * Catalog of instruments and their prices (iteration 15, ADR 0040). Global like rates: the
 * investments and sync modules value with it. PRICE_PROVIDERS is replaced by fakes in tests.
 */
@Global()
@Module({
  controllers: [InstrumentsController],
  providers: [
    {
      provide: PRICE_PROVIDERS,
      useFactory: priceProvidersFromConfig,
      inject: [AppConfig, ClockService],
    },
    PricesService,
  ],
  exports: [PricesService],
})
export class PricesModule {}
