import { Currency, isLocalDate, isPeriod, LocalDate, Period, RateType } from '@platin/domain';
import { z } from 'zod';

/** Positive decimal amount as string, up to 2 decimals: "18500.00". */
export const amountSchema = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,2})?$/, 'Ingresá un monto válido')
  .refine((value) => Number.parseFloat(value) > 0, 'El monto tiene que ser mayor a cero');

/** Signed decimal amount (balances, adjustments). */
export const signedAmountSchema = z
  .string()
  .regex(/^-?\d{1,16}(\.\d{1,2})?$/, 'Ingresá un monto válido');

/** Non-negative amount (initial balances, limits). */
export const nonNegativeAmountSchema = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,2})?$/, 'Ingresá un monto válido');

/** Exchange rate (ARS per USD, or factor to base), up to 6 decimals. */
export const rateSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'Ingresá una cotización válida')
  .refine((value) => Number.parseFloat(value) > 0, 'La cotización tiene que ser mayor a cero');

export const localDateSchema = z
  .string()
  .refine((value): value is LocalDate => isLocalDate(value), 'Fecha inválida (AAAA-MM-DD)')
  .transform((value) => value as LocalDate);

export const periodSchema = z
  .string()
  .refine((value): value is Period => isPeriod(value), 'Período inválido (AAAA-MM)')
  .transform((value) => value as Period);

export const currencySchema = z.enum([Currency.ARS, Currency.USD]);
export const rateTypeSchema = z.enum([RateType.OFICIAL, RateType.MEP, RateType.BLUE]);

export const uuidSchema = z.uuid();

export const idParamSchema = z.object({ id: uuidSchema });

/** Cursor pagination: `?cursor=&limit=`. */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
