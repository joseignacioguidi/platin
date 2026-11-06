import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import {
  plainMessage,
  TEXT_ENTRY_DATA_MESSAGES,
  TEXT_ENTRY_MESSAGES,
  type TextEntryContextResponse,
} from '@platin/contracts';
import {
  checkTextEntryDraft,
  parseTextEntry,
  type TextEntryDataError,
  type TextEntryDraft,
  type TextEntryError,
} from '@platin/domain';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from '../cards/cards.store';
import { CategoriesStore } from '../categories/categories.store';

/** What "Escribir" understood, ready for the quick entry form. */
export type Interpretation =
  | { ok: true; draft: TextEntryDraft; pocketId: string | null }
  | { ok: false; message: string }
  | { ok: false; ambiguous: [TextEntryDraft, TextEntryDraft] };

export function textEntryMessage(error: TextEntryError | TextEntryDataError): string {
  if (typeof error === 'string') return plainMessage(TEXT_ENTRY_MESSAGES[error]);
  switch (error.error) {
    case 'CURRENCY_NOT_ENABLED':
      return TEXT_ENTRY_DATA_MESSAGES.currencyNotEnabled(error.currency);
    case 'NO_BALANCE_IN_CURRENCY':
      return TEXT_ENTRY_DATA_MESSAGES.noBalanceInCurrency(error.accountName, error.currency);
    case 'SOURCE_NOT_FOUND':
      return TEXT_ENTRY_DATA_MESSAGES.sourceNotFound;
  }
}

/**
 * TXT-01: the parser runs in the browser with the data the app already has (accounts, cards,
 * categories) plus aliases, rules and the last source from GET /text-entry/context.
 */
@Injectable({ providedIn: 'root' })
export class TextEntryStore {
  private readonly bus = inject(RefreshBus);
  private readonly today = inject(Today);
  private readonly auth = inject(AuthService);
  private readonly accounts = inject(AccountsStore);
  private readonly cards = inject(CardsStore);
  private readonly categories = inject(CategoriesStore);

  readonly resource = httpResource<TextEntryContextResponse>(() => `${API}/text-entry/context`);
  readonly context = computed(() => this.resource.value() ?? null);

  constructor() {
    // A new movement changes the last source; aliases and rules change the rest.
    reloadOn(this.bus, ['text-entry', 'movements', 'accounts', 'cards', 'categories'], () =>
      this.resource.reload(),
    );
  }

  /** The source an alias names, if another account or card already uses it (TXT-02). */
  aliasOwner(alias: string): { kind: 'ACCOUNT' | 'CARD'; id: string } | null {
    return this.context()?.aliases.find((entry) => entry.alias === alias)?.source ?? null;
  }

  /**
   * Parses the text and runs the data checks. Without an alias nor a last source, the account
   * currently chosen in the form is the one checked (`fallbackAccountId`).
   */
  interpret(text: string, fallbackAccountId: string | null): Interpretation {
    const context = this.context();
    const result = parseTextEntry(text, {
      today: this.today.date(),
      aliases: context?.aliases ?? [],
      rules: context?.rules ?? [],
      globalRules: context?.globalRules ?? [],
      lastUsed: context?.lastUsed ?? null,
      categories: this.categories
        .categories()
        .filter((category) => !category.systemKey && !category.archived),
    });
    if (!result.ok) {
      return result.error === 'AMBIGUOUS_DATE'
        ? { ok: false, ambiguous: result.options }
        : { ok: false, message: textEntryMessage(result.error) };
    }
    return this.check(result.draft, fallbackAccountId);
  }

  /** CURRENCY_NOT_ENABLED, NO_BALANCE_IN_CURRENCY and a source that is no longer there. */
  check(draft: TextEntryDraft, fallbackAccountId: string | null): Interpretation {
    const resolved: TextEntryDraft =
      draft.source === null && fallbackAccountId
        ? { ...draft, source: { kind: 'ACCOUNT', id: fallbackAccountId } }
        : draft;
    const checked = checkTextEntryDraft(resolved, {
      enabledCurrencies: this.auth.user()?.currencies ?? ['ARS', 'USD'],
      accounts: this.accounts.accounts().map((account) => ({
        id: account.id,
        name: account.name,
        balances: account.pockets
          .filter((pocket) => pocket.kind === 'AVAILABLE' && !pocket.archived)
          .map((pocket) => ({ pocketId: pocket.id, currency: pocket.currency })),
      })),
      cardIds: this.cards
        .cards()
        .filter((card) => !card.archived)
        .map((card) => card.id),
    });
    return checked.ok
      ? { ok: true, draft: resolved, pocketId: checked.pocketId }
      : { ok: false, message: textEntryMessage(checked) };
  }
}
