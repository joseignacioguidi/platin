import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Currency, Decimal, toDecimal } from '@platin/domain';
import { PlChartPoint } from '../chart-tooltip/chart-tooltip';

export type PlStackTone =
  'expense' | 'card' | 'brand' | 'pending' | 'transfer' | 'savings' | 'muted';

export interface PlStackSegment {
  label: string;
  /** Decimal string; negative values count as zero. */
  amount: string;
  tone: PlStackTone;
}

/** Background class of each tone (literal, so Tailwind generates them). */
export const PL_STACK_TONE_BG: Record<PlStackTone, string> = {
  expense: 'bg-expense',
  card: 'bg-card',
  brand: 'bg-brand',
  pending: 'bg-pending',
  transfer: 'bg-transfer',
  savings: 'bg-savings',
  muted: 'bg-muted',
};

/** Display only: a share of the total as a percentage with one decimal. */
function percentOf(value: Decimal, total: Decimal): number {
  return total.isZero() ? 0 : value.dividedBy(total).times(100).toDecimalPlaces(1).toNumber();
}

/**
 * Horizontal bar split by proportion (gastado / comprometido / libre). With `limit`, when the
 * segments add up to more than it, a mark shows where it ended and the excess is striped
 * (DAS-05, "Te pasaste").
 */
@Component({
  selector: 'pl-stacked-bar',
  imports: [PlChartPoint],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <!-- DAS-06: each segment shows its exact amount; the hit area is taller than the bar. -->
    <div class="relative flex h-11 items-center gap-[3px]" role="group" [attr.aria-label]="label()">
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
      @if (excess(); as excess) {
        <div
          class="absolute inset-y-0 right-0 flex items-center"
          [style.left.%]="excess.start"
          [plChartPoint]="excessLabel()"
          [amount]="excess.amount"
          [currency]="currency()"
        >
          <div
            class="h-3 w-full rounded-r-md bg-surface bg-[repeating-linear-gradient(135deg,var(--color-expense-ink)_0_3px,transparent_3px_6px)]"
          ></div>
        </div>
        <span
          class="pointer-events-none absolute inset-y-2 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          [style.left.%]="excess.start"
          aria-hidden="true"
        ></span>
      }
    </div>
  `,
})
export class PlStackedBar {
  readonly segments = input.required<readonly PlStackSegment[]>();
  /** Currency of the amounts, for the tooltips. */
  readonly currency = input<Currency>('ARS');
  /** What there was to split; the segments beyond it are the excess. Null: no limit. */
  readonly limit = input<string | null>(null);
  /** The tooltip of the excess ("Te pasaste"). */
  readonly excessLabel = input('');

  private readonly values = computed(() =>
    this.segments().map((s) => Decimal.max(toDecimal(s.amount), 0)),
  );
  private readonly total = computed(() =>
    this.values().reduce((sum, v) => sum.plus(v), new Decimal(0)),
  );

  protected readonly parts = computed(() =>
    this.segments().map((segment, i) => ({
      label: segment.label,
      amount: segment.amount,
      tone: PL_STACK_TONE_BG[segment.tone],
      percent: percentOf(this.values()[i], this.total()),
    })),
  );

  /** Where what there was ends (in % of the bar) and by how much the segments go past it. */
  protected readonly excess = computed(() => {
    const limit = this.limit();
    if (limit === null) return null;
    const had = Decimal.max(toDecimal(limit), 0);
    const over = this.total().minus(had);
    if (!over.isPositive() || over.isZero()) return null;
    return { start: percentOf(had, this.total()), amount: over.toFixed(2) };
  });

  protected readonly label = computed(() => {
    const parts = this.parts()
      .map((p) => `${p.label} ${Math.round(p.percent)} %`)
      .join(', ');
    const excess = this.excess();
    return excess ? `${parts}, ${this.excessLabel()} ${Math.round(100 - excess.start)} %` : parts;
  });
}
