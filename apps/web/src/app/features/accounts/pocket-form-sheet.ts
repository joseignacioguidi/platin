import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { createPocketRequestSchema, type Instrument, type Pocket } from '@platin/contracts';
import type { Currency, PocketKind } from '@platin/domain';
import {
  parseTypedAmount,
  PlButton,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

export interface PocketFormData {
  accountId: string;
  /** Editing; without it, a new pocket of the account. */
  pocket?: Pocket;
}

const INSTRUMENTS: Instrument[] = [
  'CEDEAR',
  'STOCK',
  'MUTUAL_FUND',
  'TERM_DEPOSIT',
  'CRYPTO',
  'OTHER',
];

/** CTA-02: a pocket inside an account, with its currency and purpose. */
@Component({
  selector: 'pl-pocket-form-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlSelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="pocket ? f.editTitle : f.newTitle">
      <pl-form-field [label]="f.name" controlId="pocket-name">
        <input
          id="pocket-name"
          type="text"
          maxlength="60"
          [class]="input"
          [placeholder]="f.namePlaceholder"
          [value]="name()"
          (input)="name.set(value($event))"
        />
      </pl-form-field>
      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ f.kind }}</span>
        <pl-segmented [label]="f.kind" [options]="kinds" [(value)]="kind" />
        <p class="text-sm text-muted">{{ f.kindHints[kind()] }}</p>
      </div>
      @if (kind() === 'INVESTMENT') {
        <pl-form-field [label]="f.instrument" controlId="pocket-instrument">
          <pl-select
            inputId="pocket-instrument"
            [label]="f.instrument"
            [options]="instruments"
            [value]="instrument()"
            (valueChange)="instrument.set($event ?? 'OTHER')"
          />
        </pl-form-field>
      }
      @if (!pocket) {
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ f.currency }}</span>
          <pl-segmented [label]="f.currency" [options]="currencies" [(value)]="currency" />
        </div>
        <pl-form-field
          [label]="f.initialBalance + ' (' + currency() + ')'"
          controlId="pocket-balance"
        >
          <input
            id="pocket-balance"
            type="text"
            inputmode="decimal"
            [class]="input + ' font-amount'"
            [value]="balance()"
            (input)="balance.set(value($event))"
          />
        </pl-form-field>
      }
      <label class="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          class="size-5 accent-brand"
          [checked]="includeInNetWorth()"
          (change)="includeInNetWorth.set(!includeInNetWorth())"
        />
        <span>{{ f.includeInNetWorth }}</span>
      </label>
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ pocket ? f.save : f.create }}
      </button>
    </pl-sheet>
  `,
})
export class PocketFormSheet {
  protected readonly f = ACCOUNTS_TEXTS.pocketForm;
  protected readonly input = INPUT_CLASS;
  private readonly data = inject<PocketFormData>(DIALOG_DATA);
  protected readonly pocket = this.data.pocket;
  private readonly store = inject(AccountsStore);
  private readonly ref = inject(DialogRef);

  protected readonly kinds: PlSegmentOption<PocketKind>[] = (
    ['AVAILABLE', 'SAVINGS', 'INVESTMENT'] as const
  ).map((value) => ({ value, label: ACCOUNTS_TEXTS.pocketKinds[value] }));
  protected readonly currencies: PlSegmentOption<Currency>[] = (['ARS', 'USD'] as const).map(
    (value) => ({ value, label: ACCOUNTS_TEXTS.currencies[value] }),
  );
  protected readonly instruments: PlSelectOption<Instrument>[] = INSTRUMENTS.map((value) => ({
    value,
    label: ACCOUNTS_TEXTS.instruments[value],
  }));

  protected readonly name = signal(this.pocket?.name ?? '');
  protected readonly kind = signal<PocketKind>(this.pocket?.kind ?? 'SAVINGS');
  protected readonly currency = signal<Currency>(this.pocket?.currency ?? 'ARS');
  protected readonly instrument = signal<Instrument>(this.pocket?.instrument ?? 'MUTUAL_FUND');
  protected readonly balance = signal('0');
  protected readonly includeInNetWorth = signal(this.pocket?.includeInNetWorth ?? true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    const name = createPocketRequestSchema.shape.name.safeParse(this.name());
    if (!name.success) return this.error.set(this.f.errors.name);
    const instrument = this.kind() === 'INVESTMENT' ? this.instrument() : null;
    const pocket = this.pocket;
    if (pocket) {
      await this.run(() =>
        this.store.updatePocket(pocket.id, {
          name: name.data,
          kind: this.kind(),
          instrument,
          includeInNetWorth: this.includeInNetWorth(),
        }),
      );
      return;
    }
    const balance = parseTypedAmount(this.balance() || '0');
    if (balance === undefined) return this.error.set(this.f.errors.balance);
    await this.run(() =>
      this.store.createPocket(this.data.accountId, {
        name: name.data,
        kind: this.kind(),
        currency: this.currency(),
        instrument,
        initialBalance: balance,
        includeInNetWorth: this.includeInNetWorth(),
      }),
    );
  }

  private async run(action: () => Promise<Pocket>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      this.ref.close(await action());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
