import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideCheck, LucidePencil } from '@lucide/angular';
import type { CreateFixedRequest, FixedItem, SyncResponse } from '@platin/contracts';
import { fixedDayPassed, fixedStartPeriod, type FixedKind, addMonths } from '@platin/domain';
import {
  parseTypedAmount,
  PlBottomSheet,
  PlChip,
  PlMoney,
  PlSegmented,
  PlSelect,
  type PlSegmentOption,
  type PlSelectOption,
} from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { RefreshBus } from '../../core/data/refresh-bus';
import { errorMessage } from '../../core/errors';
import { Today } from '../../core/today';
import { AccountsStore } from '../accounts/accounts.store';
import { CardsStore } from '../cards/cards.store';
import { CategoriesStore } from '../categories/categories.store';
import { FixedFormSheet } from '../fixed/fixed-form-sheet';
import { FixedStore } from '../fixed/fixed.store';
import { monthName, ONBOARDING_TEXTS } from './onboarding.texts';
import { OnboardingStore } from './onboarding.store';
import { FOOT_PRIMARY, FOOT_SECONDARY, OnboardingShell } from './onboarding-shell';
import {
  FALLBACK_CATEGORY,
  FIXED_PRESETS,
  ONBOARDING_PATHS,
  pickCategory,
} from './onboarding-steps';
import {
  AMOUNT_BOX,
  AMOUNT_INPUT,
  NUMBER_INPUT,
  parseDay,
  sameName,
  TEXT_INPUT,
} from './onboarding-ui';

const OTHER = 'Otro';

interface Row {
  /** Preset name, or OTHER. */
  key: string;
  name: string;
  kind: FixedKind;
  category: string;
  amount: string;
  day: string;
  /** `p:<pocketId>` or `c:<cardId>`. */
  target: string | null;
  /** "Todavía no lo cobré / pagué": starts this month although its day passed. */
  notYet: boolean;
}

/** Step 3 (AUTH-05): what is paid or collected every month (mockup 3). */
@Component({
  selector: 'pl-onboarding-fixed',
  imports: [OnboardingShell, PlChip, PlMoney, PlSelect, PlSegmented, LucideCheck, LucidePencil],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-onboarding-shell [step]="3" [heading]="t.title" [body]="t.body" (back)="back()">
      <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t.chipsLabel">
        @for (preset of presets; track preset.name) {
          @let created = isCreated(preset.name);
          @let chosen = created || isChosen(preset.name);
          <button
            plChip
            tone="ink"
            [selected]="chosen"
            [disabled]="created || (!chosen && atLimit())"
            (click)="toggle(preset.name)"
          >
            @if (chosen) {
              <svg lucideCheck [size]="16" aria-hidden="true"></svg>
            }
            {{ preset.name }}
          </button>
        }
        <button
          plChip
          tone="ink"
          [selected]="isChosen(other)"
          [disabled]="!isChosen(other) && atLimit()"
          (click)="toggle(other)"
        >
          @if (isChosen(other)) {
            <svg lucideCheck [size]="16" aria-hidden="true"></svg>
          }
          {{ t.other }}
        </button>
      </div>
      @if (limitText()) {
        <p class="text-sm text-muted">{{ limitText() }}</p>
      }
      @if (targets().length === 0) {
        <p class="rounded-2xl bg-pending-soft px-4 py-3 text-sm">{{ t.noAccounts }}</p>
      }

      @if (existing().length > 0) {
        <section class="flex flex-col rounded-tile bg-surface px-4 pb-2 pt-1">
          <p class="mb-2 mt-3 text-[13px] font-bold uppercase text-muted">{{ t.created }}</p>
          @for (item of existing(); track item.id) {
            <div class="flex min-h-14 items-center gap-3 border-t border-line py-2">
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-[15px] font-bold">{{ item.name }}</span>
                <span class="text-[13px] text-muted">{{ t.day }} {{ item.dayOfMonth }}</span>
              </span>
              <pl-money
                [amount]="item.currentAmount"
                [currency]="item.currency"
                [sign]="item.kind === 'INCOME' ? 'always' : 'never'"
                [tone]="item.kind === 'INCOME' ? 'income' : 'none'"
              />
              <button
                type="button"
                class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-field"
                [attr.aria-label]="t.edit(item.name)"
                (click)="edit(item)"
              >
                <svg lucidePencil [size]="18" aria-hidden="true"></svg>
              </button>
            </div>
          }
        </section>
      }

      @if (rows().length > 0) {
        <section class="flex flex-col rounded-tile bg-surface px-4">
          @for (row of rows(); track row.key; let first = $first) {
            <div
              class="flex flex-col gap-2.5 py-3.5"
              [class.border-t]="!first"
              [class.border-line]="!first"
            >
              <span class="flex items-center justify-between gap-2">
                @if (row.key === other) {
                  <input
                    type="text"
                    maxlength="60"
                    [class]="textInput + ' font-bold'"
                    [attr.aria-label]="t.otherName"
                    [placeholder]="t.otherPlaceholder"
                    [value]="row.name"
                    (input)="patch(row.key, { name: value($event) })"
                  />
                } @else {
                  <span class="text-base font-bold">{{ row.name }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                    [class]="
                      row.kind === 'INCOME'
                        ? 'bg-brand-soft text-brand-strong'
                        : 'bg-field text-muted'
                    "
                    >{{ row.kind === 'INCOME' ? t.income : t.expense }}</span
                  >
                }
              </span>
              @if (row.key === other) {
                <pl-segmented
                  [label]="t.kindLabel"
                  [options]="kindOptions"
                  [value]="row.kind"
                  (valueChange)="patch(row.key, { kind: $event, target: null })"
                />
              }
              <div
                class="grid grid-cols-[minmax(0,1fr)_76px] gap-2 sm:grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)]"
              >
                <span [class]="amountBox">
                  <span class="font-amount text-muted" aria-hidden="true">{{
                    row.kind === 'INCOME' ? '+ $' : '$'
                  }}</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    [class]="amountInput"
                    [attr.aria-label]="t.amountOf(label(row))"
                    [value]="row.amount"
                    (input)="patch(row.key, { amount: value($event) })"
                  />
                </span>
                <span [class]="amountBox + ' justify-center'">
                  <span class="text-[13px] text-muted" aria-hidden="true">{{ t.day }}</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    maxlength="2"
                    [class]="dayInput"
                    [attr.aria-label]="t.dayOf(label(row))"
                    [value]="row.day"
                    (input)="patch(row.key, { day: value($event) })"
                  />
                </span>
                <pl-select
                  class="col-span-2 sm:col-span-1"
                  [label]="t.targetOf(label(row))"
                  [options]="targetOptions(row.kind)"
                  [value]="row.target"
                  (valueChange)="patch(row.key, { target: $event })"
                />
              </div>
              @if (passed(row)) {
                @if (row.notYet) {
                  <p class="text-[13px] text-muted">
                    {{ t.startsNow }}
                    <button
                      type="button"
                      class="min-h-11 font-semibold text-brand-strong"
                      (click)="patch(row.key, { notYet: false })"
                    >
                      {{ t.undo }}
                    </button>
                  </p>
                } @else {
                  <p class="text-[13px] text-muted">
                    {{ t.passed(nextMonth()) }}
                    <button
                      type="button"
                      class="min-h-11 font-semibold text-brand-strong"
                      (click)="patch(row.key, { notYet: true })"
                    >
                      {{ row.kind === 'INCOME' ? t.notYetIncome : t.notYetExpense }}
                    </button>
                  </p>
                }
              }
            </div>
          }
        </section>
      }

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      <ng-container footer>
        <button type="button" [class]="primary" [disabled]="saving()" (click)="next()">
          {{ saving() ? texts.saving : texts.next }}
        </button>
        <button type="button" [class]="secondary" [disabled]="saving()" (click)="skip()">
          {{ texts.skip }}
        </button>
      </ng-container>
    </pl-onboarding-shell>
  `,
})
export class FixedStep {
  protected readonly texts = ONBOARDING_TEXTS;
  protected readonly t = ONBOARDING_TEXTS.fixed;
  protected readonly presets = FIXED_PRESETS;
  protected readonly other = OTHER;
  protected readonly primary = FOOT_PRIMARY;
  protected readonly secondary = FOOT_SECONDARY;
  protected readonly amountBox = AMOUNT_BOX;
  protected readonly amountInput = AMOUNT_INPUT;
  protected readonly textInput = TEXT_INPUT;
  /** Inside its box, which already shows the focus ring. */
  protected readonly dayInput = NUMBER_INPUT.replace('px-3', 'px-0')
    .replace('bg-field', 'bg-transparent')
    .replace('focus:outline-2 focus:outline-brand', 'focus:outline-none');
  protected readonly kindOptions: PlSegmentOption<FixedKind>[] = [
    { value: 'EXPENSE', label: ONBOARDING_TEXTS.fixed.expense },
    { value: 'INCOME', label: ONBOARDING_TEXTS.fixed.income },
  ];

  private readonly accounts = inject(AccountsStore);
  private readonly cards = inject(CardsStore);
  private readonly categories = inject(CategoriesStore);
  private readonly fixed = inject(FixedStore);
  private readonly onboarding = inject(OnboardingStore);
  private readonly today = inject(Today);
  private readonly http = inject(HttpClient);
  private readonly bus = inject(RefreshBus);
  private readonly sheet = inject(PlBottomSheet);
  private readonly router = inject(Router);

  protected readonly rows = signal<Row[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly existing = computed(() => this.fixed.items());
  protected readonly nextMonth = computed(() => monthName(addMonths(this.today.period(), 1)));

  /** Account balances in pesos, then cards (only for expenses). */
  protected readonly targets = computed(() =>
    this.accounts
      .accounts()
      .flatMap((account) =>
        account.pockets
          .filter((p) => p.kind === 'AVAILABLE' && p.currency === 'ARS' && !p.archived)
          .map((p) => ({ value: `p:${p.id}`, label: account.name, kind: account.kind })),
      ),
  );
  private readonly cardTargets = computed(() =>
    this.cards
      .cards()
      .filter((card) => !card.archived)
      .map((card) => ({ value: `c:${card.id}`, label: card.name })),
  );

  private readonly limit = computed(() => this.onboarding.state()?.limits.fixed.max ?? null);
  protected readonly atLimit = computed(() => {
    const max = this.limit();
    return max !== null && this.existing().length + this.rows().length >= max;
  });
  protected readonly limitText = computed(() => {
    const max = this.limit();
    return max === null ? null : this.texts.planLimit(max, this.t.plural);
  });

  protected targetOptions(kind: FixedKind): PlSelectOption<string>[] {
    const accounts = this.targets().map(({ value, label }) => ({ value, label }));
    return kind === 'EXPENSE' ? [...accounts, ...this.cardTargets()] : accounts;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected label(row: Row): string {
    return row.name.trim() || this.t.other;
  }

  protected isCreated(name: string): boolean {
    return this.existing().some((item) => sameName(item.name, name));
  }

  protected isChosen(key: string): boolean {
    return this.rows().some((row) => row.key === key);
  }

  protected passed(row: Row): boolean {
    const day = parseDay(row.day);
    return day !== null && fixedDayPassed(day, this.today.date());
  }

  protected toggle(key: string): void {
    if (this.isCreated(key)) return;
    if (this.isChosen(key)) {
      this.rows.update((rows) => rows.filter((row) => row.key !== key));
      return;
    }
    const preset = this.presets.find((p) => p.name === key);
    const kind: FixedKind = preset?.kind ?? 'EXPENSE';
    this.rows.update((rows) => [
      ...rows,
      {
        key,
        name: preset?.name ?? '',
        kind,
        category: preset?.category ?? FALLBACK_CATEGORY[kind],
        amount: '',
        day: '',
        target: this.defaultTarget(kind, !!preset?.onCard),
        notYet: false,
      },
    ]);
  }

  protected patch(key: string, changes: Partial<Row>): void {
    this.rows.update((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...changes };
        if (changes.kind && row.key === OTHER) {
          next.category = FALLBACK_CATEGORY[changes.kind];
          next.target = this.defaultTarget(changes.kind, false);
        }
        return next;
      }),
    );
  }

  protected edit(item: FixedItem): void {
    this.sheet.open(FixedFormSheet, { data: item, ariaLabel: this.t.edit(item.name) });
  }

  protected back(): void {
    void this.router.navigateByUrl(ONBOARDING_PATHS.cards);
  }

  protected async next(): Promise<void> {
    this.error.set(null);
    const requests: { key: string; request: CreateFixedRequest }[] = [];
    for (const row of this.rows()) {
      const request = this.toRequest(row);
      if (typeof request === 'string') return this.error.set(request);
      requests.push({ key: row.key, request });
    }
    this.saving.set(true);
    try {
      let thisMonth = false;
      // Each one saves at once: after an error, the rows left are the ones not created.
      for (const { key, request } of requests) {
        await this.fixed.create(request);
        thisMonth ||= request.startPeriod === this.today.period();
        this.rows.update((rows) => rows.filter((row) => row.key !== key));
      }
      // The pending movements of the items that start this month (FIJ-04).
      if (thisMonth) {
        await firstValueFrom(this.http.post<SyncResponse>(`${API}/sync`, null));
        this.bus.invalidate('movements', 'commitments', 'dashboard');
      }
      await this.onboarding.mark('fixed', 'DONE');
      await this.router.navigateByUrl(ONBOARDING_PATHS.free);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async skip(): Promise<void> {
    this.saving.set(true);
    try {
      await this.onboarding.mark('fixed', 'SKIPPED');
      await this.router.navigateByUrl(ONBOARDING_PATHS.free);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** The request of a row, or the error to show. */
  private toRequest(row: Row): CreateFixedRequest | string {
    const name = row.name.trim();
    if (!name) return this.t.errors.name;
    const amount = parseTypedAmount(row.amount);
    if (amount === undefined) return this.t.errors.amount(name);
    const day = parseDay(row.day);
    if (day === null) return this.t.errors.day(name);
    if (!row.target) return this.t.errors.target(name);
    const category = pickCategory(this.categories.categories(), row.kind, row.category);
    if (!category) return this.t.errors.category(name);
    const target = row.target.startsWith('c:')
      ? { cardId: row.target.slice(2), currency: 'ARS' as const }
      : { pocketId: row.target.slice(2) };
    return {
      kind: row.kind,
      name,
      categoryId: category.id,
      ...target,
      amount,
      dayOfMonth: day,
      startPeriod: fixedStartPeriod(day, this.today.date(), !row.notYet),
    };
  }

  /** Income to the first bank or wallet; a subscription to the first card if there is one. */
  private defaultTarget(kind: FixedKind, onCard: boolean): string | null {
    const card = this.cardTargets()[0];
    if (kind === 'EXPENSE' && onCard && card) return card.value;
    const targets = this.targets();
    return (
      (targets.find((t) => t.kind === 'BANK' || t.kind === 'WALLET') ?? targets[0])?.value ?? null
    );
  }
}
