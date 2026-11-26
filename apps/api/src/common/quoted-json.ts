import { Decimal } from '@platin/domain';

const NUMBER = String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`;

/**
 * Parses JSON from a price or rate source turning the numbers of the given keys into decimal
 * strings before JSON.parse, so a price never goes through a float. Exponents ("1.2e-7", common
 * in small crypto prices) become plain decimals ("0.00000012").
 */
export function parseQuotedJson(body: string, keys: readonly string[]): unknown {
  if (keys.length === 0) return JSON.parse(body);
  const names = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`"(${names})"\\s*:\\s*(${NUMBER})(?=\\s*[,}\\]])`, 'g');
  const quoted = body.replace(
    pattern,
    (_, key: string, value: string) => `"${key}":"${new Decimal(value).toFixed()}"`,
  );
  return JSON.parse(quoted);
}

/** The same, for sources that answer a JSON array of objects. */
export function parseQuotedArray(
  body: string,
  keys: readonly string[],
  source: string,
): Record<string, unknown>[] {
  const parsed = parseQuotedJson(body, keys);
  if (!Array.isArray(parsed)) throw new Error(`Unexpected ${source} response`);
  return parsed as Record<string, unknown>[];
}
