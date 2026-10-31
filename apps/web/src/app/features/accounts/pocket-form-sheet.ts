import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { createPocketRequestSchema, type Instrument, type Pocket } from '@platin/contracts';
import type { Currency, PocketKind } from '@platin/domain';
import {
  parseTypedAmount,
  PlButton,
  PlCurrencySelect,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
  PlSheet,
} from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { showPlanBlock } from '../plans/plan-gate';
import { PlanStore } from '../plans/plan.store';
import { PLANS_TEXTS } from '../plans/plans.texts';
import { ACCOUNT_KIND_ICONS } from './account-form-sheet';
import { AccountsStore } from './accounts.store';
import { ACCOUNTS_TEXTS } from './accounts.texts';

export interface PocketFormData {
  /** Without it (from Ahorros or Inversiones), the form asks for the account. */
  accountId?: string;
  /** Initial kind of a new pocket. */
  kind?: PocketKind;
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
  imports: [PlSheet, PlButton, PlSegmented, PlSelect, PlCurrencySelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="pocket ? f.editTitle : f.newTitle">
      @if (askAccount) {
        <pl-form-field [label]="f.account" controlId="pocket-account">
          <pl-select
            inputId="pocket-account"
            [label]="f.account"
            [placeholder]="f.accountPlaceholder"
            [options]="accountOptions()"
            [value]="accountId()"
            (valueChange)="accountId.set($event)"
          />
        </pl-form-field>
      }
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
        <pl-segmented
          [label]="f.kind"
          [options]="kinds()"
          [(value)]="kind"
          (lockedChoose)="showInvestmentsBlock()"
        />
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
          <pl-currency-select [label]="f.currency" [(value)]="currency" />
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
  private readonly plan = inject(PlanStore);
  private readonly injector = inject(Injector);
  protected readonly askAccount = !this.pocket && !this.data.accountId;

  /** PLN-07: "Inversión" carries the plan mark when the plan doesn't include it. */
  protected readonly kinds = computed<PlSegmentOption<PocketKind>[]>(() => {
    const block = this.investmentsBlock();
    return (['AVAILABLE', 'SAVINGS', 'INVESTMENT'] as const).map((value) => ({
      value,
      label: ACCOUNTS_TEXTS.pocketKinds[value],
      ...(value === 'INVESTMENT' && block
        ? {
            locked: true,
            badge: block.upgrade,
            lockedLabel: PLANS_TEXTS.gate.locked(block.upgrade),
          }
        : {}),
    }));
  });
  /** An investment pocket that already exists keeps its kind after a downgrade. */
  private readonly investmentsBlock = computed(() =>
    this.pocket?.kind === 'INVESTMENT' ? null : this.plan.block('investments'),
  );
  protected readonly accountOptions = computed<PlSelectOption[]>(() =>
    this.store.accounts().map((account) => ({
      value: account.id,
      label: account.name,
      icon: ACCOUNT_KIND_ICONS[account.kind],
      tone: account.color ?? 'transfer',
    })),
  );
  protected readonly accountId = signal<string | null>(this.data.accountId ?? null);

  protected readonly instruments: PlSelectOption<Instrument>[] = INSTRUMENTS.map((value) => ({
    value,
    label: ACCOUNTS_TEXTS.instruments[value],
  }));

  protected readonly name = signal(this.pocket?.name ?? '');
  protected readonly kind = signal<PocketKind>(this.pocket?.kind ?? this.initialKind());
  protected readonly currency = signal<Currency>(this.pocket?.currency ?? 'ARS');
  protected readonly instrument = signal<Instrument>(this.pocket?.instrument ?? 'MUTUAL_FUND');
  protected readonly balance = signal('0');
  protected readonly includeInNetWorth = signal(this.pocket?.includeInNetWorth ?? true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private initialKind(): PocketKind {
    const kind = this.data.kind ?? 'SAVINGS';
    return kind === 'INVESTMENT' && this.plan.block('investments') ? 'SAVINGS' : kind;
  }

  protected showInvestmentsBlock(): void {
    const block = this.investmentsBlock();
    if (block) showPlanBlock(this.injector, block);
  }

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
    const accountId = this.accountId();
    if (!accountId) return this.error.set(this.f.errors.account);
    const balance = parseTypedAmount(this.balance() || '0');
    if (balance === undefined) return this.error.set(this.f.errors.balance);
    await this.run(() =>
      this.store.createPocket(accountId, {
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
