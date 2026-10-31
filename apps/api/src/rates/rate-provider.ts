import { Injectable } from '@nestjs/common';
import type { Currency, RateType } from '@platin/domain';
import { AppConfig } from '../config/app-config';

export interface FetchedRate {
  /** Missing = USD (the dollar types). */
  currency?: Currency;
  type: RateType;
  /** ARS per unit as decimal strings (never parsed as floats). */
  buy: string;
  sell: string;
}

/** Currencies other than the dollar that come from GET /v1/cotizaciones, at the oficial rate. */
const OTHER_CURRENCIES: readonly Currency[] = ['EUR', 'BRL', 'CLP', 'UYU'];

/** Source of exchange rates. Swappable without touching the rest (architecture, "Cotizaciones"). */
export abstract class RateProvider {
  abstract readonly name: string;
  abstract fetchAll(): Promise<FetchedRate[]>;
}

const TYPES_BY_HOUSE: Record<string, RateType> = { oficial: 'OFICIAL', blue: 'BLUE', bolsa: 'MEP' };
const TIMEOUT_MS = 5000;

/**
 * DolarApi: GET /v1/dolares for the dollar (oficial, blue and MEP, "bolsa") and
 * GET /v1/cotizaciones for the euro, real and Chilean and Uruguayan pesos (oficial). If the
 * second one fails, the dollar still counts: the other currencies keep their last stored rate.
 */
@Injectable()
export class DolarApiProvider extends RateProvider {
  readonly name = 'dolarapi';

  constructor(private readonly config: AppConfig) {
    super();
  }

  async fetchAll(): Promise<FetchedRate[]> {
    const [dollars, others] = await Promise.allSettled([
      this.get('/v1/dolares').then(parseDolarApi),
      this.get('/v1/cotizaciones').then(parseCotizaciones),
    ]);
    if (dollars.status === 'rejected') throw dollars.reason;
    return [...dollars.value, ...(others.status === 'fulfilled' ? others.value : [])];
  }

  private async get(path: string): Promise<string> {
    const response = await fetch(`${this.config.env.RATES_BASE_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`DolarApi answered ${response.status}`);
    return response.text();
  }
}

/** Quotes compra/venta before JSON.parse so they never go through a float. */
function parseQuoted(body: string): Record<string, unknown>[] {
  const quoted = body.replace(/"(compra|venta)"\s*:\s*(-?\d+(?:\.\d+)?)/g, '"$1":"$2"');
  const parsed: unknown = JSON.parse(quoted);
  if (!Array.isArray(parsed)) throw new Error('Unexpected DolarApi response');
  return parsed as Record<string, unknown>[];
}

/** GET /v1/cotizaciones: EUR, BRL, CLP and UYU at the oficial rate (the dollar comes apart). */
export function parseCotizaciones(body: string): FetchedRate[] {
  const rates: FetchedRate[] = [];
  for (const item of parseQuoted(body)) {
    const currency = String(item['moneda']).toUpperCase() as Currency;
    const buy = item['compra'];
    const sell = item['venta'];
    if (
      OTHER_CURRENCIES.includes(currency) &&
      String(item['casa']) === 'oficial' &&
      typeof buy === 'string' &&
      typeof sell === 'string'
    ) {
      rates.push({ currency, type: 'OFICIAL', buy, sell });
    }
  }
  return rates;
}

/**
 * Parses DolarApi's JSON keeping compra/venta as strings: they are JSON numbers, so they are
 * quoted before JSON.parse to never go through a float.
 */
export function parseDolarApi(body: string): FetchedRate[] {
  const rates: FetchedRate[] = [];
  for (const item of parseQuoted(body)) {
    const type = TYPES_BY_HOUSE[String(item['casa'])];
    const buy = item['compra'];
    const sell = item['venta'];
    if (type && typeof buy === 'string' && typeof sell === 'string')
      rates.push({ type, buy, sell });
  }
  if (rates.length === 0) throw new Error('DolarApi returned no known rates');
  return rates;
}
