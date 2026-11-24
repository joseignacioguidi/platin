import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { StatementSummary, TransactionMovement } from '@platin/contracts';
import { isCardCurrency, Money, parsePeriod } from '@platin/domain';
import {
  formatPeriodShort,
  HideAmounts,
  moneyText,
  PlButton,
  PlSelect,
  type PlSelectOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from '../cards/cards.store';
import { FeedsStore } from './feeds.store';
import { FEED_MOVEMENT_TEXTS } from './feeds.texts';

export interface ConvertMovementData {
  movement: TransactionMovement;
  to: 'TRANSFER' | 'CARD_PAYMENT';
}

/**
 * MPG-08: an income or expense from Mercado Pago that was money moved, not spent: a transfer
 * to (or from) another account, or the payment of a closed card statement.
 */
@Component({
  selector: 'pl-convert-movement-sheet',
  imports: [PlSheet, PlButton, PlSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet>
      <h2 class="text-xl font-extrabold">{{ title }}</h2>
      <p class="text-[15px] text-muted">{{ t.transferHint }}</p>

      @if (data.to === 'TRANSFER') {
        <pl-select
          [label]="t.account"
          [options]="accountOptions()"
          [value]="accountId()"
          (valueChange)="accountId.set($event)"
        />
      } @else {
        <pl-select
          [label]="t.card"
          [options]="cardOptions()"
          [value]="cardId()"
          (valueChange)="pickCard($event)"
        />
        @if (cardId()) {
          @if (statementOptions().length > 0) {
            <pl-select
              [label]="t.statement"
              [options]="statementOptions()"
              [value]="statementId()"
              (valueChange)="statementId.set($event)"
            />
          } @else if (!loading()) {
            <p class="text-sm text-muted">{{ t.noStatements }}</p>
          }
        }
      }

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="busy() || !ready()" (click)="convert()">
        {{ t.convert }}
      </button>
    </pl-sheet>
  `,
})
export class ConvertMovementSheet {
  protected readonly t = FEED_MOVEMENT_TEXTS;
  protected readonly data = inject<ConvertMovementData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly accounts = inject(AccountsStore);
  private readonly cards = inject(CardsStore);
  private readonly feeds = inject(FeedsStore);
  private readonly hideAmounts = inject(HideAmounts);

  protected readonly title =
    this.data.to === 'CARD_PAYMENT'
      ? this.t.isCardPayment
      : this.data.movement.type === 'INCOME'
        ? this.t.transferInTitle
        : this.t.transferTitle;
  protected readonly accountId = signal<string | null>(null);
  protected readonly cardId = signal<string | null>(null);
  protected readonly statementId = signal<string | null>(null);
  private readonly statements = signal<StatementSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Other accounts with a balance in the movement's currency. */
  protected readonly accountOptions = computed<PlSelectOption[]>(() =>
    this.accounts
      .accounts()
      .filter(
        (account) =>
          account.id !== this.data.movement.pocket.accountId &&
          account.pockets.some(
            (p) => p.kind === 'AVAILABLE' && p.currency === this.data.movement.currency,
          ),
      )
      .map((account) => ({ value: account.id, label: account.name })),
  );
  protected readonly cardOptions = computed<PlSelectOption[]>(() =>
    this.cards.cards().map((card) => ({ value: card.id, label: card.name })),
  );
  /** Closed statements with at least this amount pending in its currency. */
  protected readonly statementOptions = computed<PlSelectOption[]>(() => {
    const { amount, currency } = this.data.movement;
    if (!isCardCurrency(currency)) return [];
    const paid = Money.of(amount, currency);
    return this.statements()
      .filter((s) => s.status !== 'OPEN' && s.status !== 'PAID')
      .filter((s) => !paid.greaterThan(Money.of(s.pending[currency], currency)))
      .map((s) => ({
        value: s.id,
        label: this.t.statementLabel(
          formatPeriodShort(parsePeriod(s.period)),
          moneyText(s.pending[currency], currency, this.hideAmounts.hidden()),
        ),
      }));
  });
  protected readonly ready = computed(() =>
    this.data.to === 'TRANSFER' ? !!this.accountId() : !!this.statementId(),
  );

  protected async pickCard(cardId: string | null): Promise<void> {
    this.cardId.set(cardId);
    this.statementId.set(null);
    this.statements.set([]);
    if (!cardId) return;
    this.loading.set(true);
    try {
      this.statements.set(await this.cards.statementHistory(cardId, undefined, 6));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async convert(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.feeds.convert(
        this.data.movement.id,
        this.data.to === 'TRANSFER'
          ? { to: 'TRANSFER', toAccountId: this.accountId() as string }
          : { to: 'CARD_PAYMENT', statementId: this.statementId() as string },
      );
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
