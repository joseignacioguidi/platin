import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Currency, Decimal, toDecimal } from '@platin/domain';
import { PlChartPoint } from '../chart-tooltip/chart-tooltip';

export type PlStackTone = 'expense' | 'card' | 'brand' | 'pending' | 'transfer' | 'savings';

export interface PlStackSegment {
  label: string;
  /** Decimal string; negative values count as zero. */
  amount: string;
  tone: PlStackTone;
}

const TONES: Record<PlStackTone, string> = {
  expense: 'bg-expense',
  card: 'bg-card',
  brand: 'bg-brand',
  pending: 'bg-pending',
  transfer: 'bg-transfer',
  savings: 'bg-savings',
};

/** Horizontal bar split by proportion (gastado / comprometido / libre). */
@Component({
  selector: 'pl-stacked-bar',
  imports: [PlChartPoint],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- DAS-06: each segment shows its exact amount; the hit area is taller than the bar. -->
    <div class="flex h-11 items-center gap-[3px]" role="group" [attr.aria-label]="label()">
      @for (part of parts(); track part.label; let first = $first; let last = $last) {
        @if (part.percent > 0) {
          <div
            class="flex h-full items-center rounded-md"
            [style.width.%]="part.percent"
            [plChartPoint]="part.label"
            [amount]="part.amount"
            [currency]="currency()"
          >
            <div
              class="h-3 w-full rounded-[2px]"
              [class]="part.tone"
              [class.rounded-l-md]="first"
              [class.rounded-r-md]="last"
            ></div>
          </div>
        }
      }
    </div>
  `,
})
export class PlStackedBar {
  readonly segments = input.required<readonly PlStackSegment[]>();
  /** Currency of the amounts, for the tooltips. */
  readonly currency = input<Currency>('ARS');

  protected readonly parts = computed(() => {
    const values = this.segments().map((s) => Decimal.max(toDecimal(s.amount), 0));
    const total = values.reduce((sum, v) => sum.plus(v), new Decimal(0));
    return this.segments().map((segment, i) => ({
      label: segment.label,
      amount: segment.amount,
      tone: TONES[segment.tone],
      // Display only: percentages for widths, rounded to one decimal.
      percent: total.isZero()
        ? 0
        : values[i].dividedBy(total).times(100).toDecimalPlaces(1).toNumber(),
    }));
  });

  protected readonly label = computed(() =>
    this.parts()
      .map((p) => `${p.label} ${Math.round(p.percent)} %`)
      .join(', '),
  );
}
