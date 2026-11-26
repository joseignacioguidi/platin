import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PRICE_PROVIDERS, type PriceProvider } from './price-provider';
import { PricesService } from './prices.service';

/** The providers this deployment uses; each phase of iteration 15 adds its own. */
export function priceProvidersFromConfig(config: AppConfig): PriceProvider[] {
  void config;
  return [];
}

/**
 * Catalog of instruments and their prices (iteration 15, ADR 0040). Global like rates: the
 * investments and sync modules value with it. PRICE_PROVIDERS is replaced by fakes in tests.
 */
@Global()
@Module({
  providers: [
    { provide: PRICE_PROVIDERS, useFactory: priceProvidersFromConfig, inject: [AppConfig] },
    PricesService,
  ],
  exports: [PricesService],
})
export class PricesModule {}
