import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideChevronRight, LucideInfo } from '@lucide/angular';
import type { Dashboard } from '@platin/contracts';
import { Currency, dateParts, lastDayOf, Money, Period } from '@platin/domain';
import {
  HideAmounts,
  moneyText,
  PlBottomSheet,
  PlInfoTip,
  PL_STACK_TONE_BG,
  PlMoney,
  PlStackedBar,
  PlStackSegment,
  PlStackTone,
} from '@platin/web-ui';
import { DASHBOARD_TEXTS } from './dashboard.texts';
import { HomeToPay, ToPayData } from './home-to-pay';
import { IncomeSheet, IncomeSheetData } from './income-sheet';
import { MonthSummarySheet, MonthSummaryData } from './month-summary-sheet';

type RowAction = 'income' | 'toPay' | 'summary';

/** A line of "Cómo se llega al libre". */
interface FlowRow {
  key: string;
  label: string;
  help: string;
  amount: string;
  /** The bar segment's color; null for what there was. */
  tone: PlStackTone | null;
  action: RowAction | null;
  bold?: boolean;
  /** A line between what there was and where it went. */
  divided?: boolean;
}

const nonNegative = (money: Money) => (money.isNegative() ? Money.zero(money.currency) : money);

/**
 * DAS-07 (1) and DAS-05 (iteration 11): what is left to spend this month and the month from
 * start to end. The bar measures what there was for the month (at the start plus incomes) and
 * splits it into paid, reserved, to pay and free; past it, striped, what went beyond it.
 * "Ingresos del mes", "Para pagar este mes" and "Libre" open their sheets.
 */
@Component({
  selector: 'pl-home-free-card',
  imports: [NgTemplateOutlet, PlMoney, PlStackedBar, PlInfoTip, LucideChevronRight, LucideInfo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = dashboard();
    <section
      class="flex h-full flex-wrap items-start gap-x-7 gap-y-4 rounded-card bg-surface p-5 xl:p-6"
      [attr.aria-label]="texts.leftToSpend"
    >
      <div class="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <p class="text-[15px] text-muted">{{ past() ? texts.free : texts.leftToSpend }}</p>
        <pl-money
          class="text-[40px] leading-tight font-bold tracking-tight xl:text-5xl"
          [amount]="d.free"
          [currency]="d.currency"
          [decimals]="false"
        />
        @if (past()) {
          <p class="text-[13px] text-muted">{{ texts.pastHint }}</p>
        } @else if (d.perDay) {
          <p
            class="self-start rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-strong"
          >
            ≈ <pl-money [amount]="d.perDay" [currency]="d.currency" [decimals]="false" />
            {{ texts.perDay }} {{ lastDay() }}
          </p>
        } @else {
          <p class="self-start rounded-full bg-field px-3 py-1.5 text-sm font-semibold">
            {{ texts.noFree }}
          </p>
          @if (negative()) {
            <p class="text-sm text-expense-ink">
              {{ texts.missing }}
              <pl-money [amount]="excess()" [currency]="d.currency" [decimals]="false" />
              {{ texts.missingRest }}
            </p>
          }
        }
      </div>

      <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
        <p class="text-sm text-muted">
          {{ texts.hadPrefix }}
          <pl-money class="text-ink" [amount]="had()" [currency]="d.currency" [decimals]="false" />
          {{ texts.hadSuffix }}
        </p>
        <p class="sr-only">{{ barSummary() }}</p>
        <pl-stacked-bar
          [segments]="segments()"
          [currency]="d.currency"
          [limit]="had()"
          [excessLabel]="texts.overspent"
        />
        @if (negative()) {
          <p class="text-sm font-semibold text-expense-ink">
            {{ texts.overspent }}
            <pl-money [amount]="excess()" [currency]="d.currency" [decimals]="false" />
          </p>
        }
        <!-- Each part with a help tooltip; the ones with › open their sheet from the whole row. -->
        <div class="flex flex-col">
          @for (row of rows(); track row.key; let first = $first) {
            <div
              class="relative flex min-h-11 items-center gap-2.5"
              [class.border-t]="!first"
              [class.border-line-soft]="!first && !row.divided"
              [class.border-line]="row.divided"
            >
              @if (row.tone) {
                <span
                  class="size-2.5 shrink-0 rounded-full"
                  [class]="dots[row.tone]"
                  aria-hidden="true"
                ></span>
              } @else {
                <span class="size-2.5 shrink-0" aria-hidden="true"></span>
              }
              <span class="min-w-0 flex-1 text-[15px]" [class.font-bold]="row.bold">
                @if (row.action) {
                  <button
                    type="button"
                    class="text-left after:absolute after:inset-0 after:rounded-xl"
                    (click)="open(row.action)"
                  >
                    {{ row.label }}</button
                  ><ng-container
                    *ngTemplateOutlet="help; context: { term: row.label, text: row.help }"
                  />
                } @else {
                  {{ row.label
                  }}<ng-container
                    *ngTemplateOutlet="help; context: { term: row.label, text: row.help }"
                  />
                }
              </span>
              <pl-money
                class="text-[15px]"
                [class.font-bold]="row.bold"
                [class.mr-7]="!row.action"
                [amount]="row.amount"
                [currency]="d.currency"
                [decimals]="false"
              />
              @if (row.action) {
                <svg
                  lucideChevronRight
                  class="shrink-0 text-muted"
                  [size]="18"
                  aria-hidden="true"
                ></svg>
              }
            </div>
          }
        </div>
        <ng-template #help let-term="term" let-text="text">
          <!--
            Inline after the last word, so it follows the label when it wraps. 44 px to tap with
            the icon small (negative margins keep the line height); above the stretched button.
          -->
          <button
            class="relative z-10 -my-3 -mr-3 -ml-1 inline-flex size-11 items-center justify-center rounded-full align-middle text-muted hover:text-ink"
            [term]="term"
            [plInfoTip]="text"
            [attr.aria-label]="texts.helpLabel(term)"
          >
            <svg lucideInfo [size]="16" aria-hidden="true"></svg>
          </button>
        </ng-template>
      </div>
    </section>
  `,
})
export class HomeFreeCard {
  readonly dashboard = input.required<Dashboard>();
  /** A previous month: no "to collect" nor "to pay"; the free amount is what was left. */
  readonly past = input(false);
  protected readonly texts = DASHBOARD_TEXTS;
  protected readonly dots = PL_STACK_TONE_BG;
  private readonly sheet = inject(PlBottomSheet);
  private readonly hideAmounts = inject(HideAmounts);

  private readonly money = computed(() => {
    const d = this.dashboard();
    const of = (amount: string) => Money.of(amount, d.currency);
    return {
      opening: of(d.opening),
      income: of(d.received).add(of(d.toCollect)),
      paidOut: of(d.paidOut),
      reserved: of(d.reserved),
      toPay: of(d.toPay),
      other: of(d.other),
      free: of(d.free),
    };
  });

  protected readonly negative = computed(() => this.money().free.isNegative());
  protected readonly excess = computed(() => this.money().free.abs().toString());

  /**
   * What there was for the month: at the start, the incomes and a positive "otros". A negative
   * start or "otros" goes with what went; money taken back from reserves adds to what there was.
   */
  protected readonly had = computed(() => {
    const m = this.money();
    return nonNegative(m.opening)
      .add(nonNegative(m.income))
      .add(nonNegative(m.other))
      .add(nonNegative(m.reserved.negate()))
      .toString();
  });

  protected readonly segments = computed<PlStackSegment[]>(() => {
    const m = this.money();
    const t = this.texts;
    const otherOut = nonNegative(m.other.negate()).add(nonNegative(m.opening.negate()));
    const segments: PlStackSegment[] = [
      { label: t.paidOut, amount: m.paidOut.toString(), tone: 'expense' },
      { label: t.reserved, amount: nonNegative(m.reserved).toString(), tone: 'savings' },
    ];
    if (!this.past())
      segments.push({ label: t.toPayMonth, amount: m.toPay.toString(), tone: 'pending' });
    if (otherOut.isPositive())
      segments.push({ label: t.other, amount: otherOut.toString(), tone: 'muted' });
    segments.push({ label: t.freeShort, amount: nonNegative(m.free).toString(), tone: 'brand' });
    return segments;
  });

  protected readonly rows = computed<FlowRow[]>(() => {
    const m = this.money();
    const t = this.texts;
    const past = this.past();
    const rows: FlowRow[] = [];
    if (!m.opening.isZero()) {
      rows.push({
        key: 'opening',
        label: t.opening,
        help: t.help.opening,
        amount: m.opening.toString(),
        tone: null,
        action: null,
      });
    }
    rows.push({
      key: 'income',
      label: t.income,
      help: past ? t.help.incomePast : t.help.income,
      amount: m.income.toString(),
      tone: null,
      action: 'income',
    });
    rows.push({
      key: 'paidOut',
      label: t.paidOut,
      help: t.help.paidOut,
      amount: m.paidOut.toString(),
      tone: 'expense',
      action: null,
      divided: true,
    });
    rows.push({
      key: 'reserved',
      label: t.reserved,
      help: t.help.reserved,
      amount: m.reserved.toString(),
      tone: 'savings',
      action: null,
    });
    if (!past) {
      rows.push({
        key: 'toPay',
        label: t.toPayMonth,
        help: t.help.toPay,
        amount: m.toPay.toString(),
        tone: 'pending',
        action: 'toPay',
      });
    }
    if (!m.other.isZero()) {
      rows.push({
        key: 'other',
        label: t.other,
        help: t.help.other,
        amount: m.other.toString(),
        tone: m.other.isNegative() ? 'muted' : null,
        action: null,
      });
    }
    rows.push({
      key: 'free',
      label: t.freeShort,
      help: past ? t.help.freePast : t.help.free,
      amount: m.free.toString(),
      tone: 'brand',
      action: 'summary',
      bold: true,
    });
    return rows;
  });

  /** The bar in words, for screen readers (it respects "ocultar montos"). */
  protected readonly barSummary = computed(() => {
    const d = this.dashboard();
    const text = (amount: string) => this.amountText(amount, d.currency);
    const parts = this.segments()
      .filter((s) => !Money.of(s.amount, d.currency).isZero())
      .map((s) => `${s.label.toLowerCase()} ${text(s.amount)}`)
      .join(', ');
    const summary = this.texts.barSummary(text(this.had()), parts);
    return this.negative() ? `${summary} ${this.texts.barExcess(text(this.excess()))}` : summary;
  });

  /** "30/11". */
  protected readonly lastDay = computed(() => {
    const { day, month } = dateParts(lastDayOf(this.dashboard().period as Period));
    return `${day}/${month}`;
  });

  private amountText(amount: string, currency: Currency): string {
    return moneyText(
      Money.of(amount, currency).amount.toFixed(0),
      currency,
      this.hideAmounts.hidden(),
    );
  }

  protected open(action: RowAction): void {
    const d = this.dashboard();
    if (action === 'toPay') {
      this.sheet.open(HomeToPay, {
        data: { items: d.toPayItems, currency: d.currency, total: d.toPay } satisfies ToPayData,
        ariaLabel: this.texts.toPayTitle,
      });
    } else if (action === 'income') {
      this.sheet.open(IncomeSheet, {
        data: { period: d.period as Period } satisfies IncomeSheetData,
        ariaLabel: this.texts.incomeTitle,
      });
    } else {
      this.sheet.open(MonthSummarySheet, {
        data: {
          period: d.period as Period,
          toPay: { items: d.toPayItems, currency: d.currency, total: d.toPay },
        } satisfies MonthSummaryData,
        ariaLabel: this.texts.freeShort,
      });
    }
  }
}
