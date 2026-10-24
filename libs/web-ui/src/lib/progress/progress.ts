import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PlProgressTone = 'brand' | 'savings' | 'card' | 'pending' | 'expense';

const FILL: Record<PlProgressTone, string> = {
  brand: 'bg-brand',
  savings: 'bg-savings',
  card: 'bg-card',
  pending: 'bg-pending',
  expense: 'bg-expense',
};
const TRACK: Record<PlProgressTone, string> = {
  brand: 'bg-brand-soft',
  savings: 'bg-savings-soft',
  card: 'bg-card-soft',
  pending: 'bg-pending-soft',
  expense: 'bg-expense-soft',
};
const STROKE: Record<PlProgressTone, string> = {
  brand: 'stroke-brand',
  savings: 'stroke-savings',
  card: 'stroke-card',
  pending: 'stroke-pending',
  expense: 'stroke-expense',
};
const TRACK_STROKE: Record<PlProgressTone, string> = {
  brand: 'stroke-brand-soft',
  savings: 'stroke-savings-soft',
  card: 'stroke-card-soft',
  pending: 'stroke-pending-soft',
  expense: 'stroke-expense-soft',
};

/** Progress as a bar or a ring (goals). `value` is 0..100. */
@Component({
  selector: 'pl-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'clamped()',
    '[attr.aria-label]': 'label()',
    class: 'block',
  },
  template: `
    @if (variant() === 'ring') {
      <div class="relative" [style.width.px]="size()" [style.height.px]="size()">
        <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" class="-rotate-90" aria-hidden="true">
          <circle
            [attr.cx]="center()"
            [attr.cy]="center()"
            [attr.r]="radius()"
            fill="none"
            [attr.stroke-width]="stroke()"
            [class]="trackStroke()"
          />
          <circle
            [attr.cx]="center()"
            [attr.cy]="center()"
            [attr.r]="radius()"
            fill="none"
            stroke-linecap="round"
            [attr.stroke-width]="stroke()"
            [attr.stroke-dasharray]="circumference()"
            [attr.stroke-dashoffset]="offset()"
            [class]="fillStroke()"
          />
        </svg>
        <span
          class="font-amount absolute inset-0 flex items-center justify-center text-[28px] font-semibold"
        >
          {{ clamped() }}%
        </span>
      </div>
    } @else {
      <div class="h-2 overflow-hidden rounded-full" [class]="track()">
        <div class="h-full rounded-full" [class]="fill()" [style.width.%]="clamped()"></div>
      </div>
    }
  `,
})
export class PlProgress {
  readonly value = input.required<number>();
  readonly variant = input<'bar' | 'ring'>('bar');
  readonly tone = input<PlProgressTone>('brand');
  readonly size = input(120);
  readonly label = input<string>();

  protected readonly clamped = computed(() => Math.round(Math.min(100, Math.max(0, this.value()))));
  protected readonly stroke = computed(() => Math.round(this.size() / 9));
  protected readonly center = computed(() => this.size() / 2);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(() => this.circumference() * (1 - this.clamped() / 100));
  protected readonly fill = computed(() => FILL[this.tone()]);
  protected readonly track = computed(() => TRACK[this.tone()]);
  protected readonly fillStroke = computed(() => STROKE[this.tone()]);
  protected readonly trackStroke = computed(() => TRACK_STROKE[this.tone()]);
}
