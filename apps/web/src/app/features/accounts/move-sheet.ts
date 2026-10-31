import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { Account } from '@platin/contracts';
import { impliedRate, LocalDate, Money, PocketKind, TransferIntent } from '@platin/domain';
import {
  formatRate,
  parseTypedAmount,
  PlButton,
  PlDateField,
  PlPocketSelect,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { Today } from '../../core/today';
import { TransactionsStore } from '../transactions/transactions.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

export interface MoveSheetData {
  account: Account;
  intent: TransferIntent;
  /** Preselected origin (the pocket the action was opened from). */
  fromPocketId?: string;
}

/** Which pockets each quick action moves money from and to (CTA-05, INV-02). */
const ROUTES: Record<TransferIntent, { from: PocketKind[]; to: PocketKind[] }> = {
  SAVE: { from: ['AVAILABLE'], to: ['SAVINGS'] },
  INVEST: { from: ['AVAILABLE', 'SAVINGS'], to: ['INVESTMENT'] },
  REDEEM: { from: ['SAVINGS', 'INVESTMENT'], to: ['AVAILABLE'] },
  MOVE: { from: [], to: [] },
};

/**
 * CTA-05: "Apartar", "Invertir" and "Rescatar" inside one account in two taps: the origin and
 * destination come preselected, only the amount is missing. Between currencies it asks for
 * both amounts and shows the resulting rate (buying dollars inside Mercado Pago).
 */
@Component({
  selector: 'pl-move-sheet',
  imports: [PlSheet, PlButton, PlPocketSelect, PlDateField, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.titles[data.intent] + ' · ' + data.account.name">
      @if (destinations().length === 0) {
        <p class="rounded-2xl bg-pending-soft px-4 py-3 text-[15px] text-pending-ink">
          {{ t.noDestination[data.intent] }}
        </p>
      } @else {
        <div class="grid grid-cols-2 gap-2">
          <pl-pocket-select
            appearance="tile"
            [label]="t.from"
            [pockets]="pockets()"
            [kinds]="route.from"
            [value]="fromId()"
            (valueChange)="fromId.set($event)"
          />
          <pl-pocket-select
            appearance="tile"
            [label]="t.to"
            [pockets]="pockets()"
            [kinds]="route.to"
            [exclude]="fromId() ? [fromId()!] : []"
            [value]="toId()"
            (valueChange)="toId.set($event)"
          />
        </div>
        <pl-form-field
          [label]="t.amount + ' (' + (from()?.currency ?? 'ARS') + ')'"
          controlId="move-amount"
        >
          <input
            id="move-amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            [class]="input + ' font-amount text-2xl'"
            [value]="amount()"
            (input)="amount.set(value($event))"
            (keydown.enter)="save()"
          />
        </pl-form-field>
        @if (crossCurrency()) {
          <pl-form-field
            [label]="t.received + ' (' + to()?.currency + ')'"
            controlId="move-received"
          >
            <input
              id="move-received"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              [class]="input + ' font-amount'"
              [value]="received()"
              (input)="received.set(value($event))"
            />
          </pl-form-field>
          @if (rateLabel()) {
            <p class="font-amount text-sm text-muted" aria-live="polite">{{ rateLabel() }}</p>
          }
        }
        <pl-form-field [label]="t.date" controlId="move-date">
          <pl-date-field
            inputId="move-date"
            [label]="t.date"
            [max]="today.date()"
            [value]="date()"
            (valueChange)="setDate($event)"
          />
        </pl-form-field>
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
          {{ t.save[data.intent] }}
        </button>
      }
    </pl-sheet>
  `,
})
export class MoveSheet {
  protected readonly t = ACCOUNTS_TEXTS.move;
  protected readonly input = INPUT_CLASS;
  protected readonly data = inject<MoveSheetData>(DIALOG_DATA);
  protected readonly route = ROUTES[this.data.intent];
  protected readonly today = inject(Today);
  private readonly transactions = inject(TransactionsStore);
  private readonly ref = inject(DialogRef);

  /** Only the pockets of this account: these actions move money inside it. */
  protected readonly pockets = computed(() =>
    this.data.account.pockets.filter((pocket) => !pocket.archived),
  );
  protected readonly destinations = computed(() =>
    this.pockets().filter((p) => this.route.to.length === 0 || this.route.to.includes(p.kind)),
  );

  protected readonly fromId = signal<string | null>(this.firstOrigin());
  protected readonly toId = signal<string | null>(null);
  protected readonly amount = signal('');
  protected readonly received = signal('');
  protected readonly date = signal<LocalDate>(this.today.date());
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly from = computed(() => this.pockets().find((p) => p.id === this.fromId()));
  protected readonly to = computed(() => this.pockets().find((p) => p.id === this.toId()));
  protected readonly crossCurrency = computed(
    () => !!this.from() && !!this.to() && this.from()?.currency !== this.to()?.currency,
  );
  protected readonly rateLabel = computed(() => {
    const from = this.from();
    const to = this.to();
    const out = parseTypedAmount(this.amount());
    const into = parseTypedAmount(this.received());
    if (!from || !to || !out || !into) return null;
    const rate = impliedRate(Money.of(out, from.currency), Money.of(into, to.currency));
    return rate ? this.t.rate(formatRate(from.currency, to.currency, rate)) : null;
  });

  constructor() {
    // The destination defaults to the first one in the origin's currency (or any).
    effect(() => {
      const from = this.from();
      if (this.toId() && this.toId() !== this.fromId()) return;
      const options = this.destinations().filter((p) => p.id !== from?.id);
      const same = options.find((p) => p.currency === from?.currency);
      this.toId.set((same ?? options[0])?.id ?? null);
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setDate(date: LocalDate | null): void {
    if (date) this.date.set(date);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const errors = this.t.errors;
    const amount = parseTypedAmount(this.amount());
    if (!amount) return this.error.set(errors.amount);
    const from = this.from();
    const to = this.to();
    if (!from || !to) return this.error.set(errors.pockets);
    const amountIn = this.crossCurrency() ? parseTypedAmount(this.received()) : undefined;
    if (this.crossCurrency() && !amountIn) return this.error.set(errors.received);
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.transactions.transfer({
        fromPocketId: from.id,
        toPocketId: to.id,
        amountOut: amount,
        amountIn,
        date: this.date(),
        intent: this.data.intent,
      });
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** The pocket it was opened from, or the first one that fits the action (Disponible). */
  private firstOrigin(): string | null {
    const candidates = this.data.account.pockets.filter(
      (p) => !p.archived && (this.route.from.length === 0 || this.route.from.includes(p.kind)),
    );
    const preferred = candidates.find((p) => p.id === this.data.fromPocketId);
    return (preferred ?? candidates.find((p) => p.currency === 'ARS') ?? candidates[0])?.id ?? null;
  }
}
