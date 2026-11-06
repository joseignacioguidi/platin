import {
  CURRENCIES,
  isReservedTextEntryWord,
  normalizeAlias,
  normalizePattern,
  type Currency,
  type TextEntryError,
} from '@platin/domain';
import { z } from 'zod';
import { uuidSchema } from './common';

// ---------- Aliases (TXT-02) ----------

/** One word to name an account or a card when writing ("mp", "visa"); stored normalized. */
export const aliasSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá un nombre')
  .max(20, 'Usá hasta 20 letras')
  .transform(normalizeAlias)
  .refine((value) => /^[a-z0-9]+$/.test(value), 'Usá solo letras y números')
  .refine((value) => !/^\d+$/.test(value), 'Un nombre no puede ser solo números')
  .refine(
    (value) => !isReservedTextEntryWord(value),
    'Esa palabra ya significa otra cosa (una moneda, una fecha o un monto)',
  );

export const putAliasesRequestSchema = z.object({
  aliases: z
    .array(aliasSchema)
    .max(10, 'Hasta 10 nombres')
    .transform((list) => [...new Set(list)]),
});
export const aliasesResponseSchema = z.object({ aliases: z.array(z.string()) });

export type PutAliasesRequest = z.input<typeof putAliasesRequestSchema>;
export type AliasesResponse = z.infer<typeof aliasesResponseSchema>;

// ---------- Merchant rules (TXT-03, TXT-04) ----------

export const merchantPatternSchema = z
  .string()
  .trim()
  .min(2, 'Ingresá al menos 2 letras')
  .max(40)
  .transform(normalizePattern);

export const channelSchema = z.enum(['APP', 'TELEGRAM']);
export type ChannelValue = z.infer<typeof channelSchema>;

export const merchantRuleSchema = z.object({
  id: uuidSchema,
  pattern: z.string(),
  categoryId: uuidSchema,
  createdVia: channelSchema,
  createdAt: z.string(),
});
export const createMerchantRuleRequestSchema = z.object({
  pattern: merchantPatternSchema,
  categoryId: uuidSchema,
});
export const updateMerchantRuleRequestSchema = createMerchantRuleRequestSchema.partial();

export type MerchantRule = z.infer<typeof merchantRuleSchema>;
export type CreateMerchantRuleRequest = z.input<typeof createMerchantRuleRequestSchema>;
export type UpdateMerchantRuleRequest = z.input<typeof updateMerchantRuleRequestSchema>;

/** ADM-05 / TXT-04: `merchant-rules` setting, pointing to suggested category names. */
export const globalMerchantRuleSchema = z.object({
  pattern: merchantPatternSchema,
  categoryName: z.string().trim().min(1).max(40),
});
export const merchantRulesSettingSchema = z.object({
  rules: z
    .array(globalMerchantRuleSchema)
    .max(200)
    .refine(
      (list) => new Set(list.map((rule) => rule.pattern)).size === list.length,
      'Hay reglas repetidas',
    ),
});
export type GlobalMerchantRule = z.infer<typeof globalMerchantRuleSchema>;
export type MerchantRulesSetting = z.infer<typeof merchantRulesSettingSchema>;

// ---------- Context (TXT-01) ----------

export const textEntrySourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ACCOUNT'), id: uuidSchema }),
  z.object({ kind: z.literal('CARD'), id: uuidSchema }),
]);

/** GET /text-entry/context: what the parser needs besides the categories the app already has. */
export const textEntryContextSchema = z.object({
  aliases: z.array(z.object({ alias: z.string(), source: textEntrySourceSchema })),
  rules: z.array(z.object({ pattern: z.string(), categoryId: uuidSchema })),
  globalRules: z.array(z.object({ pattern: z.string(), categoryName: z.string() })),
  lastUsed: textEntrySourceSchema.nullable(),
});
export type TextEntryContextResponse = z.infer<typeof textEntryContextSchema>;

/** A parser draft as stored by the bot (BotDraft.draft), validated when read. */
export const textEntryDraftSchema = z.object({
  type: z.enum(['EXPENSE', 'INCOME']),
  amount: z.string(),
  currency: z.enum(CURRENCIES as [Currency, ...Currency[]]),
  source: textEntrySourceSchema.nullable(),
  installments: z.number().int().min(1).max(60),
  date: z.string(),
  scheduled: z.boolean(),
  description: z.string(),
  categoryId: z.string().nullable(),
});

// ---------- Messages, shared by the web and the bot ----------

const CURRENCY_NAMES: Record<Currency, string> = {
  ARS: 'pesos',
  USD: 'dólares',
  EUR: 'euros',
  BRL: 'reales',
  CLP: 'pesos chilenos',
  UYU: 'pesos uruguayos',
};

/** "dólares", "euros"... for the messages. */
export function currencyName(currency: Currency): string {
  return CURRENCY_NAMES[currency];
}

/**
 * The messages of the "Carga por texto" rule. `*x*` marks an example (bold on Telegram,
 * plain text in the web).
 */
export const TEXT_ENTRY_MESSAGES: Record<TextEntryError, string> = {
  NO_AMOUNT: 'No encontré el monto. Probá así: *super 4500*.',
  ZERO_AMOUNT: 'El monto tiene que ser mayor a cero.',
  SEVERAL_AMOUNTS: 'Encontré más de un monto. Mandame un gasto por mensaje.',
  SEVERAL_SOURCES: 'Nombraste más de una cuenta o tarjeta. Dejá una sola.',
  INSTALLMENTS_WITHOUT_CARD: 'Las cuotas van con tarjeta. Agregá cuál, por ejemplo *visa 3c*.',
  TOO_MANY_INSTALLMENTS: 'Puedo cargar hasta 60 cuotas.',
  CARD_CANNOT_BE_SCHEDULED: 'Las compras con tarjeta no se programan. Cargala el día que la hagas.',
  INCOME_ON_CARD: 'Un ingreso no puede ir a una tarjeta. Decime a qué cuenta entra.',
  CARD_CURRENCY: 'Las tarjetas son en pesos o en dólares.',
  INVALID_DATE: 'Esa fecha no existe. Probá con *3/11* o *ayer*.',
  DATE_TOO_FAR: 'Puedo programar hasta 12 meses adelante.',
};

export const TEXT_ENTRY_DATA_MESSAGES = {
  currencyNotEnabled: (currency: Currency) =>
    `No tenés activados los ${currencyName(currency)}. Activalos en platin › Perfil › Monedas.`,
  noBalanceInCurrency: (accountName: string, currency: Currency) =>
    `${accountName} no tiene saldo en ${currencyName(currency)}.`,
  sourceNotFound: 'Esa cuenta o tarjeta ya no existe. Elegí otra.',
};

/** "¿Qué 20?" and the two buttons of AMBIGUOUS_DATE: "20/10 · ya pasó", "20/11 · programar". */
export const AMBIGUOUS_DATE_TEXTS = {
  question: (day: number) => `¿Qué ${day}?`,
  past: (dayMonth: string) => `${dayMonth} · ya pasó`,
  future: (dayMonth: string) => `${dayMonth} · programar`,
};

/** Removes the example marks for plain text. */
export function plainMessage(message: string): string {
  return message.replace(/\*([^*]+)\*/g, '$1');
}
