import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, LucideIconInput } from '@lucide/angular';

/** Empty screen that explains what to load first. Actions go in the content slot. */
@Component({
  selector: 'pl-empty-state',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center">
      @if (icon(); as icon) {
        <div
          class="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-strong"
        >
          <svg [lucideIcon]="icon" [size]="26"></svg>
        </div>
      }
      <h2 class="text-lg font-bold">{{ heading() }}</h2>
      @if (description()) {
        <p class="max-w-sm text-[15px] text-muted">{{ description() }}</p>
      }
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class PlEmptyState {
  readonly heading = input.required<string>();
  readonly description = input<string>();
  readonly icon = input<LucideIconInput>();
}
