import { Injectable } from '@nestjs/common';
import type { RateType } from '@platin/domain';
import { AppConfig } from '../config/app-config';

export interface FetchedRate {
  type: RateType;
  /** ARS per USD as decimal strings (never parsed as floats). */
  buy: string;
  sell: string;
}

/** Source of exchange rates. Swappable without touching the rest (architecture, "Cotizaciones"). */
export abstract class RateProvider {
  abstract readonly name: string;
  abstract fetchAll(): Promise<FetchedRate[]>;
}

const TYPES_BY_HOUSE: Record<string, RateType> = { oficial: 'OFICIAL', blue: 'BLUE', bolsa: 'MEP' };
const TIMEOUT_MS = 5000;

/** DolarApi: one request (GET /v1/dolares) for oficial, blue and MEP ("bolsa"). */
@Injectable()
export class DolarApiProvider extends RateProvider {
  readonly name = 'dolarapi';

  constructor(private readonly config: AppConfig) {
    super();
  }

  async fetchAll(): Promise<FetchedRate[]> {
    const response = await fetch(`${this.config.env.RATES_BASE_URL}/v1/dolares`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`DolarApi answered ${response.status}`);
    return parseDolarApi(await response.text());
  }
}

/**
 * Parses DolarApi's JSON keeping compra/venta as strings: they are JSON numbers, so they are
 * quoted before JSON.parse to never go through a float.
 */
export function parseDolarApi(body: string): FetchedRate[] {
  const quoted = body.replace(/"(compra|venta)"\s*:\s*(-?\d+(?:\.\d+)?)/g, '"$1":"$2"');
  const parsed: unknown = JSON.parse(quoted);
  if (!Array.isArray(parsed)) throw new Error('Unexpected DolarApi response');
  const rates: FetchedRate[] = [];
  for (const item of parsed as Record<string, unknown>[]) {
    const type = TYPES_BY_HOUSE[String(item['casa'])];
    const buy = item['compra'];
    const sell = item['venta'];
    if (type && typeof buy === 'string' && typeof sell === 'string')
      rates.push({ type, buy, sell });
  }
  if (rates.length === 0) throw new Error('DolarApi returned no known rates');
  return rates;
}
