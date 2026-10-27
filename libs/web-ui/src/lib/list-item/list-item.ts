import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput } from '@lucide/angular';

export type PlTone = 'brand' | 'expense' | 'pending' | 'transfer' | 'card' | 'savings' | 'muted';

/** Tinted background + text of an icon badge, per tone. */
export const PL_TONE_CLASSES: Record<PlTone, string> = {
  brand: 'bg-brand-soft text-brand-strong',
  expense: 'bg-expense-soft text-ink',
  pending: 'bg-pending-soft text-ink',
  transfer: 'bg-transfer-soft text-ink',
  card: 'bg-card-soft text-ink',
  savings: 'bg-savings-soft text-ink',
  muted: 'bg-field text-ink',
};

/**
 * Row of a movement, commitment or account: tinted icon, title, subtitle and a trailing slot
 * (usually amounts). Use inside a list; wrap in a button/link to make it interactive.
 */
@Component({
  selector: 'pl-list-item',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-[68px] items-center gap-3 py-3' },
  template: `
    @if (icon(); as icon) {
      <span
        class="flex size-12 shrink-0 items-center justify-center rounded-2xl"
        [class]="toneClass()"
        aria-hidden="true"
      >
        <svg [lucideIcon]="icon" [size]="22"></svg>
      </span>
    }
    <span class="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span class="flex items-center gap-2">
        <span class="truncate text-[17px] font-semibold">{{ heading() }}</span>
        <ng-content select="[badge]" />
      </span>
      @if (subtitle()) {
        <span class="truncate text-sm text-muted">{{ subtitle() }}</span>
      }
    </span>
    <span class="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <ng-content />
    </span>
  `,
})
export class PlListItem {
  readonly heading = input.required<string>();
  readonly subtitle = input<string | null>();
  readonly icon = input<LucideIconInput | null>();
  readonly tone = input<PlTone>('muted');

  protected readonly toneClass = computed(() => PL_TONE_CLASSES[this.tone()]);
}
