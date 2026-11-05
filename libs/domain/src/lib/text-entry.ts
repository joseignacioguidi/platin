/**
 * Text entry (TXT-01, BOT-02): turns a short line ("super 45k visa 3c") into a draft of an
 * income, an expense, a scheduled movement or a card purchase. Pure: "today", the aliases, the
 * rules and the categories come in the context. When in doubt it does not guess: it returns an
 * error code, or the two options of an ambiguous date.
 */
import {
  addDays,
  addMonths,
  compareDates,
  dateParts,
  daysBetween,
  daysInMonth,
  dayInPeriod,
  LocalDate,
  makeLocalDate,
  periodOf,
} from './dates';
import { CategoryKind, Currency, isCardCurrency } from './enums';
import { Decimal, Money } from './money';

export const MAX_TEXT_INSTALLMENTS = 60;
/** How far back a day and month without a year can be read as the past one. */
const RECENT_DAYS = 30;
/** Scheduling limit: 12 months from today. */
const MAX_MONTHS_AHEAD = 12;
/** Step 3 of the category: only words this long are compared with category names. */
const MIN_PREFIX_LENGTH = 4;

export type TextEntrySource = { kind: 'ACCOUNT'; id: string } | { kind: 'CARD'; id: string };

export interface TextEntryAlias {
  /** Normalized with `normalizeAlias`. */
  alias: string;
  source: TextEntrySource;
}

export interface TextEntryRule {
  /** Normalized with `normalizePattern`: one or more whole words. */
  pattern: string;
  categoryId: string;
}

export interface TextEntryGlobalRule {
  pattern: string;
  /** The name of a suggested category; it applies when the user has one with that name. */
  categoryName: string;
}

export interface TextEntryCategory {
  id: string;
  name: string;
  kind: CategoryKind;
}

export interface TextEntryContext {
  today: LocalDate;
  aliases: readonly TextEntryAlias[];
  rules: readonly TextEntryRule[];
  globalRules: readonly TextEntryGlobalRule[];
  /** Active categories the user can pick (not the system ones). */
  categories: readonly TextEntryCategory[];
  /** The account or card used last, in the app or the bot, for texts without an alias. */
  lastUsed?: TextEntrySource | null;
}

export interface TextEntryDraft {
  type: 'EXPENSE' | 'INCOME';
  /** Positive decimal string with 2 decimals, "45000.00". */
  amount: string;
  currency: Currency;
  /** Null when there is no alias nor a usable last source: the form picks its default. */
  source: TextEntrySource | null;
  installments: number;
  date: LocalDate;
  /** A date after today (MOV-08). Never on a card. */
  scheduled: boolean;
  /** The words left, as the person wrote them. Empty: the movement takes the category's name. */
  description: string;
  categoryId: string | null;
}

export const TEXT_ENTRY_ERRORS = [
  'NO_AMOUNT',
  'ZERO_AMOUNT',
  'SEVERAL_AMOUNTS',
  'SEVERAL_SOURCES',
  'INSTALLMENTS_WITHOUT_CARD',
  'TOO_MANY_INSTALLMENTS',
  'CARD_CANNOT_BE_SCHEDULED',
  'INCOME_ON_CARD',
  'CARD_CURRENCY',
  'INVALID_DATE',
  'DATE_TOO_FAR',
] as const;
export type TextEntryError = (typeof TEXT_ENTRY_ERRORS)[number];

export type TextEntryResult =
  | { ok: true; draft: TextEntryDraft }
  | { ok: false; error: TextEntryError }
  /** "el 20" when today is the 5th: the past one and the coming one (scheduled). */
  | { ok: false; error: 'AMBIGUOUS_DATE'; options: [TextEntryDraft, TextEntryDraft] };

// ---------- Normalization ----------

/** Lowercase, without accents and with single spaces: how texts are compared. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** An alias is one word: normalized and without spaces ("Mercado Pago" → "mercadopago"). */
export function normalizeAlias(value: string): string {
  return normalizeText(value).replace(/ /g, '');
}

/** A merchant rule pattern: normalized words ("  Coto " → "coto"). */
export function normalizePattern(value: string): string {
  return normalizeText(value);
}

// ---------- Vocabulary ----------

const CURRENCY_WORDS: Record<string, Currency> = {
  usd: 'USD',
  'u$s': 'USD',
  'u$d': 'USD',
  'us$': 'USD',
  dolar: 'USD',
  dolares: 'USD',
  verdes: 'USD',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  brl: 'BRL',
  real: 'BRL',
  reales: 'BRL',
  clp: 'CLP',
  chilenos: 'CLP',
  uyu: 'UYU',
  uruguayos: 'UYU',
  ars: 'ARS',
  pesos: 'ARS',
};
/** Codes that can be glued to the amount: "20usd", "usd20". */
const GLUED_CURRENCY = /(usd|u\$s|u\$d|us\$|eur|brl|clp|uyu|ars)/.source;
const MULTIPLIER_WORDS: Record<string, string> = {
  k: '1000',
  mil: '1000',
  luca: '1000',
  lucas: '1000',
  m: '1000000',
  palo: '1000000',
  palos: '1000000',
};
const NUMBER = /(\d{1,3}(?:\.\d{3})+|\d+)(?:([.,])(\d+))?/.source;
const AMOUNT_RE = new RegExp(`^(?:${GLUED_CURRENCY}|\\$)?${NUMBER}(k|m)?${GLUED_CURRENCY}?$`);
const INCOME_WORDS = new Set(['cobre', 'cobro', 'sueldo', 'ingreso', 'aguinaldo']);
const FILLER_WORDS = new Set([
  'en',
  'con',
  'de',
  'la',
  'el',
  'por',
  'a',
  'que',
  'pague',
  'gaste',
]);

const DATE_WORDS = new Set(['hoy', 'ayer', 'anteayer', 'manana', 'pasado', 'proximo']);

/**
 * Words the parser reads as something else (a currency, a multiplier, a date, installments or
 * a filler): an alias with one of them would never match.
 */
export function isReservedTextEntryWord(value: string): boolean {
  const word = normalizeAlias(value);
  return (
    word in CURRENCY_WORDS ||
    word in MULTIPLIER_WORDS ||
    FILLER_WORDS.has(word) ||
    DATE_WORDS.has(word) ||
    word === 'cuota' ||
    word === 'cuotas' ||
    /^\d+c$/.test(word) ||
    /^x\d+$/.test(word)
  );
}

// ---------- Tokens ----------

interface Token {
  /** As written, without trailing punctuation. */
  raw: string;
  /** Normalized, for matching. */
  norm: string;
  used: boolean;
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[,.;:!?¡¿]+$/u, '').replace(/^[¡¿]+/u, ''))
    .filter((word) => word.length > 0)
    .map((raw) => ({ raw, norm: normalizeText(raw), used: false }));
}

function isDayNumber(norm: string | undefined): number | null {
  if (!norm || !/^\d{1,2}$/.test(norm)) return null;
  const day = Number(norm);
  return day >= 1 && day <= 31 ? day : null;
}

// ---------- Dates ----------

type DateSpec =
  | { kind: 'RELATIVE'; days: number }
  /** "el 20": this month if it already came, ambiguous otherwise. */
  | { kind: 'DAY'; day: number }
  /** "el próximo 20", "el 20 que viene". */
  | { kind: 'NEXT_DAY'; day: number }
  | { kind: 'DAY_MONTH'; day: number; month: number }
  | { kind: 'FULL'; day: number; month: number; year: number };

/** Tries a date expression at position i; returns it and how many tokens it takes. */
function matchDate(tokens: Token[], i: number): { spec: DateSpec; length: number } | null {
  const at = (k: number) => tokens[i + k]?.norm;
  const word = at(0);
  if (word === 'pasado' && at(1) === 'manana') return { spec: rel(2), length: 2 };
  if (word === 'hoy') return { spec: rel(0), length: 1 };
  if (word === 'ayer') return { spec: rel(-1), length: 1 };
  if (word === 'anteayer') return { spec: rel(-2), length: 1 };
  if (word === 'manana') return { spec: rel(1), length: 1 };

  // "el próximo 20" / "próximo 20"
  const nextOffset = word === 'el' && at(1) === 'proximo' ? 1 : word === 'proximo' ? 0 : -1;
  if (nextOffset >= 0) {
    const day = isDayNumber(at(nextOffset + 1));
    if (day !== null && !isMultiplier(at(nextOffset + 2))) {
      return { spec: { kind: 'NEXT_DAY', day }, length: nextOffset + 2 };
    }
  }
  if (word === 'el') {
    const day = isDayNumber(at(1));
    if (day !== null && !isMultiplier(at(2))) {
      if (at(2) === 'que' && at(3) === 'viene') {
        return { spec: { kind: 'NEXT_DAY', day }, length: 4 };
      }
      return { spec: { kind: 'DAY', day }, length: 2 };
    }
  }

  const slash = word ? /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(word) : null;
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    if (slash[3] === undefined) return { spec: { kind: 'DAY_MONTH', day, month }, length: 1 };
    const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return { spec: { kind: 'FULL', day, month, year }, length: 1 };
  }
  return null;
}

function rel(days: number): DateSpec {
  return { kind: 'RELATIVE', days };
}

function isMultiplier(norm: string | undefined): boolean {
  return norm !== undefined && norm in MULTIPLIER_WORDS;
}

function safeDate(year: number, month: number, day: number): LocalDate | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return makeLocalDate(year, month, day);
}

type ResolvedDate =
  | { ok: true; date: LocalDate }
  | { ok: false; error: 'INVALID_DATE' }
  | { ok: false; error: 'AMBIGUOUS_DATE'; options: [LocalDate, LocalDate] };

/**
 * The date of the spec. With a card the past is always chosen (purchases are not scheduled),
 * so a card never makes a date ambiguous.
 */
function resolveDate(spec: DateSpec, today: LocalDate, onCard: boolean): ResolvedDate {
  const now = dateParts(today);
  switch (spec.kind) {
    case 'RELATIVE':
      return { ok: true, date: addDays(today, spec.days) };
    case 'DAY': {
      const thisMonth = safeDate(now.year, now.month, spec.day);
      if (spec.day <= now.day && thisMonth) return { ok: true, date: thisMonth };
      const prevPeriod = addMonths(periodOf(today), -1);
      const past = safeDate(Number(prevPeriod.slice(0, 4)), Number(prevPeriod.slice(5)), spec.day);
      if (onCard) return past ? { ok: true, date: past } : { ok: false, error: 'INVALID_DATE' };
      // Only one of the two exists ("el 31" in November): that one, there is nothing to ask.
      if (past && thisMonth) return { ok: false, error: 'AMBIGUOUS_DATE', options: [past, thisMonth] };
      if (past) return { ok: true, date: past };
      if (thisMonth) return { ok: true, date: thisMonth };
      return { ok: false, error: 'INVALID_DATE' };
    }
    case 'NEXT_DAY': {
      const period = spec.day > now.day ? periodOf(today) : addMonths(periodOf(today), 1);
      const date = safeDate(Number(period.slice(0, 4)), Number(period.slice(5)), spec.day);
      return date ? { ok: true, date } : { ok: false, error: 'INVALID_DATE' };
    }
    case 'DAY_MONTH': {
      if (!existsInSomeYear(spec.day, spec.month)) return { ok: false, error: 'INVALID_DATE' };
      const upcoming = nearestOccurrence(spec.day, spec.month, today, 1);
      const past = nearestOccurrence(spec.day, spec.month, today, -1);
      if (onCard) return { ok: true, date: past };
      return {
        ok: true,
        date: daysBetween(past, today) <= RECENT_DAYS ? past : upcoming,
      };
    }
    case 'FULL': {
      const date = safeDate(spec.year, spec.month, spec.day);
      return date ? { ok: true, date } : { ok: false, error: 'INVALID_DATE' };
    }
  }
}

function existsInSomeYear(day: number, month: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(2000, month);
}

/** The first date with that day and month from `from` going forward (1) or backward (-1). */
function nearestOccurrence(day: number, month: number, from: LocalDate, step: 1 | -1): LocalDate {
  const { year } = dateParts(from);
  // 29/2 can be up to 8 years away (2096 → 2104); 9 tries cover every case.
  for (let k = 0; k < 9; k++) {
    const candidate = safeDate(year + k * step, month, day);
    if (candidate && compareDates(candidate, from) * step >= 0) return candidate;
  }
  throw new Error(`No occurrence of ${day}/${month}`);
}

function maxScheduleDate(today: LocalDate): LocalDate {
  return dayInPeriod(addMonths(periodOf(today), MAX_MONTHS_AHEAD), dateParts(today).day);
}

// ---------- Amounts ----------

interface ParsedAmount {
  value: Decimal;
  currency: Currency | null;
  length: number;
}

function matchAmount(tokens: Token[], i: number): ParsedAmount | null {
  const match = AMOUNT_RE.exec(tokens[i].norm);
  if (!match) return null;
  const [, prefixCurrency, integer, separator, fraction, glued, suffixCurrency] = match;
  // "1.5" is a decimal (a dot followed by three digits would separate thousands); a comma
  // is always decimal. "1.5000" is neither.
  if (separator === '.' && fraction.length > 2) return null;
  let value = new Decimal(integer.replace(/\./g, '') + (fraction ? `.${fraction}` : ''));
  let length = 1;
  if (glued) {
    value = value.times(MULTIPLIER_WORDS[glued]);
  } else if (isMultiplier(tokens[i + 1]?.norm)) {
    value = value.times(MULTIPLIER_WORDS[tokens[i + 1].norm]);
    length = 2;
  }
  const code = prefixCurrency ?? suffixCurrency;
  return { value, currency: code ? CURRENCY_WORDS[code] : null, length };
}

// ---------- Installments ----------

function matchInstallments(tokens: Token[], i: number): { count: number; length: number } | null {
  const at = (k: number) => tokens[i + k]?.norm;
  const isCuotas = (norm: string | undefined) => norm === 'cuotas' || norm === 'cuota';
  const offset = at(0) === 'en' ? 1 : 0;
  const first = at(offset);
  if (!first) return null;
  let length = offset + 1;
  let match = /^(\d+)(?:c|cuotas?)$/.exec(first) ?? /^x(\d+)$/.exec(first);
  if (!match && isCuotas(at(offset + 1))) {
    match = /^(\d+)$/.exec(first);
    length = offset + 2;
  }
  if (!match) return null;
  const count = Number(match[1]);
  // "0c" is not an installment count: it stays in the reason.
  return count >= 1 ? { count, length } : null;
}

// ---------- Categories ----------

function containsWords(haystack: string[], pattern: string): boolean {
  const needle = pattern.split(' ').filter(Boolean);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, k) => haystack[i + k] === word)) return true;
  }
  return false;
}

/** The matching rule with the longest pattern, or null. */
function bestRule<T extends { pattern: string }>(rules: readonly T[], words: string[]): T | null {
  let best: T | null = null;
  for (const rule of rules) {
    const pattern = normalizePattern(rule.pattern);
    if (!containsWords(words, pattern)) continue;
    if (!best || pattern.length > normalizePattern(best.pattern).length) best = rule;
  }
  return best;
}

/**
 * `ruleWords` are the words left by the parser, fillers included ("la anónima");
 * `words` are those of the reason.
 */
function guessCategory(
  ruleWords: string[],
  words: string[],
  kind: CategoryKind,
  context: TextEntryContext,
): string | null {
  if (ruleWords.length === 0) return null;
  const ofKind = context.categories.filter((category) => category.kind === kind);
  const byId = new Map(ofKind.map((category) => [category.id, category]));

  // 1. The user's rules.
  const own = bestRule(
    context.rules.filter((rule) => byId.has(rule.categoryId)),
    ruleWords,
  );
  if (own) return own.categoryId;

  // 2. Global rules, when the user has a category with that name.
  const byName = new Map(ofKind.map((category) => [normalizeText(category.name), category.id]));
  const global = bestRule(
    context.globalRules.filter((rule) => byName.has(normalizeText(rule.categoryName))),
    ruleWords,
  );
  if (global) return byName.get(normalizeText(global.categoryName)) ?? null;

  // 3. A word of 4 letters or more the name of exactly one category starts with.
  const candidates = new Set<string>();
  for (const word of words) {
    if (word.length < MIN_PREFIX_LENGTH) continue;
    for (const category of ofKind) {
      if (normalizeText(category.name).startsWith(word)) candidates.add(category.id);
    }
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

// ---------- Parser ----------

function sameSource(a: TextEntrySource, b: TextEntrySource): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function parseTextEntry(text: string, context: TextEntryContext): TextEntryResult {
  let body = text.trim();
  let income = false;
  if (body.startsWith('+')) {
    income = true;
    body = body.slice(1);
  }
  const tokens = tokenize(body);
  const aliases = new Map(context.aliases.map((entry) => [normalizeAlias(entry.alias), entry]));

  const amounts: ParsedAmount[] = [];
  const sources: TextEntrySource[] = [];
  let currency: Currency | null = null;
  let installments: number | null = null;
  let dateSpec: DateSpec | null = null;

  const take = (i: number, length: number) => {
    for (let k = 0; k < length; k++) tokens[i + k].used = true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.used) continue;

    if (!dateSpec) {
      const date = matchDate(tokens, i);
      if (date) {
        dateSpec = date.spec;
        take(i, date.length);
        continue;
      }
    }

    if (installments === null) {
      const found = matchInstallments(tokens, i);
      if (found) {
        installments = found.count;
        take(i, found.length);
        continue;
      }
    }

    // "pesos chilenos", "pesos uruguayos"
    if (token.norm === 'pesos' && ['chilenos', 'uruguayos'].includes(tokens[i + 1]?.norm ?? '')) {
      currency ??= CURRENCY_WORDS[tokens[i + 1].norm];
      take(i, 2);
      continue;
    }
    if (token.norm in CURRENCY_WORDS) {
      currency ??= CURRENCY_WORDS[token.norm];
      take(i, 1);
      continue;
    }
    if (token.norm === '$') {
      take(i, 1);
      continue;
    }

    const amount = matchAmount(tokens, i);
    if (amount) {
      amounts.push(amount);
      take(i, amount.length);
      continue;
    }

    // An alias is one word; "mercado pago" also matches the alias "mercadopago".
    const pair = tokens[i + 1] && !tokens[i + 1].used ? token.norm + tokens[i + 1].norm : null;
    const alias = (pair && aliases.get(normalizeAlias(pair))) || aliases.get(normalizeAlias(token.norm));
    if (alias) {
      if (!sources.some((source) => sameSource(source, alias.source))) sources.push(alias.source);
      take(i, pair && aliases.get(normalizeAlias(pair)) ? 2 : 1);
      continue;
    }

    if (INCOME_WORDS.has(token.norm)) income = true;
  }

  if (amounts.length === 0) return { ok: false, error: 'NO_AMOUNT' };
  if (amounts.length > 1) return { ok: false, error: 'SEVERAL_AMOUNTS' };
  const parsed = amounts[0];
  const finalCurrency = parsed.currency ?? currency ?? 'ARS';
  const money = Money.of(parsed.value.toFixed(), finalCurrency);
  if (money.isZero()) return { ok: false, error: 'ZERO_AMOUNT' };
  if (sources.length > 1) return { ok: false, error: 'SEVERAL_SOURCES' };

  const type = income ? 'INCOME' : 'EXPENSE';
  const named = sources[0] ?? null;
  if (named?.kind === 'CARD') {
    if (type === 'INCOME') return { ok: false, error: 'INCOME_ON_CARD' };
    if (!isCardCurrency(finalCurrency)) return { ok: false, error: 'CARD_CURRENCY' };
  }

  if (installments !== null && installments > MAX_TEXT_INSTALLMENTS) {
    return { ok: false, error: 'TOO_MANY_INSTALLMENTS' };
  }

  // Without an alias, the last source used, if it fits: a card only takes expenses in pesos or
  // dollars on a date that is clearly not after today. Otherwise the form picks its default.
  const fallback = named ? null : (context.lastUsed ?? null);
  const plainDate = dateSpec ? resolveDate(dateSpec, context.today, false) : null;
  const notFuture =
    plainDate === null || (plainDate.ok && compareDates(plainDate.date, context.today) <= 0);
  const fallbackFits =
    fallback !== null &&
    (fallback.kind === 'ACCOUNT' ||
      (type === 'EXPENSE' && isCardCurrency(finalCurrency) && notFuture));
  const source = named ?? (fallbackFits ? fallback : null);
  const onCard = source?.kind === 'CARD';

  const count = installments ?? 1;
  if (count > 1 && !onCard) return { ok: false, error: 'INSTALLMENTS_WITHOUT_CARD' };

  const left = tokens.filter((token) => !token.used);
  const reason = left.filter((token) => !FILLER_WORDS.has(token.norm));
  const description = reason.map((token) => token.raw).join(' ');
  const categoryId = guessCategory(
    left.map((token) => token.norm),
    reason.map((token) => token.norm),
    type,
    context,
  );
  const draftFor = (date: LocalDate): TextEntryDraft => ({
    type,
    amount: money.toString(),
    currency: finalCurrency,
    source,
    installments: onCard ? count : 1,
    date,
    scheduled: compareDates(date, context.today) > 0,
    description,
    categoryId,
  });

  if (!dateSpec) return { ok: true, draft: draftFor(context.today) };
  const resolved = resolveDate(dateSpec, context.today, onCard);
  if (!resolved.ok && resolved.error === 'INVALID_DATE') return resolved;
  const latest = resolved.ok ? resolved.date : resolved.options[1];
  if (compareDates(latest, maxScheduleDate(context.today)) > 0) {
    return { ok: false, error: 'DATE_TOO_FAR' };
  }
  if (onCard && compareDates(latest, context.today) > 0) {
    return { ok: false, error: 'CARD_CANNOT_BE_SCHEDULED' };
  }
  if (!resolved.ok) {
    return {
      ok: false,
      error: 'AMBIGUOUS_DATE',
      options: [draftFor(resolved.options[0]), draftFor(resolved.options[1])],
    };
  }
  return { ok: true, draft: draftFor(resolved.date) };
}

// ---------- Data checks after the parser ----------

export type TextEntryDataError =
  | { error: 'CURRENCY_NOT_ENABLED'; currency: Currency }
  | { error: 'NO_BALANCE_IN_CURRENCY'; accountName: string; currency: Currency }
  | { error: 'SOURCE_NOT_FOUND' };

export interface TextEntryAccount {
  id: string;
  name: string;
  /** The account balance (AVAILABLE pocket) of each currency it has. */
  balances: readonly { pocketId: string; currency: Currency }[];
}

export interface TextEntryData {
  enabledCurrencies: readonly Currency[];
  accounts: readonly TextEntryAccount[];
  cardIds: readonly string[];
}

/**
 * What depends on the data, after the parser (TextEntryService in the API, the same helper in
 * the web): the currency is enabled, the account has a balance in it and the source still exists.
 * Returns the pocket an account source resolves to.
 */
export function checkTextEntryDraft(
  draft: TextEntryDraft,
  data: TextEntryData,
): { ok: true; pocketId: string | null } | ({ ok: false } & TextEntryDataError) {
  if (!data.enabledCurrencies.includes(draft.currency)) {
    return { ok: false, error: 'CURRENCY_NOT_ENABLED', currency: draft.currency };
  }
  const source = draft.source;
  if (!source) return { ok: true, pocketId: null };
  if (source.kind === 'CARD') {
    return data.cardIds.includes(source.id)
      ? { ok: true, pocketId: null }
      : { ok: false, error: 'SOURCE_NOT_FOUND' };
  }
  const account = data.accounts.find((candidate) => candidate.id === source.id);
  if (!account) return { ok: false, error: 'SOURCE_NOT_FOUND' };
  const balance = account.balances.find((candidate) => candidate.currency === draft.currency);
  if (!balance) {
    return {
      ok: false,
      error: 'NO_BALANCE_IN_CURRENCY',
      accountName: account.name,
      currency: draft.currency,
    };
  }
  return { ok: true, pocketId: balance.pocketId };
}
