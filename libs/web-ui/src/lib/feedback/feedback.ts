import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideRefreshCw } from '@lucide/angular';
import { PlButton } from '../button/button';

/** Placeholder blocks while a screen loads (announced as busy to screen readers). */
@Component({
  selector: 'pl-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-3',
    role: 'status',
    'aria-busy': 'true',
    '[attr.aria-label]': 'label()',
  },
  template: `
    @for (block of blocks(); track $index) {
      <div
        class="animate-pulse rounded-tile bg-line-soft motion-reduce:animate-none"
        [style.height.px]="block"
      ></div>
    }
  `,
})
export class PlSkeleton {
  /** Heights in px of each block. */
  readonly heights = input<number[]>([180, 72, 72, 72]);
  readonly label = input('Cargando…');
  protected readonly blocks = computed(() => this.heights());
}

/** Error with a retry button. */
@Component({
  selector: 'pl-error-state',
  imports: [PlButton, LucideRefreshCw],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center"
      role="alert"
    >
      <p class="text-[17px] font-semibold">{{ heading() }}</p>
      <p class="max-w-sm text-[15px] text-muted">{{ message() }}</p>
      <button plButton="secondary" type="button" (click)="retry.emit()">
        <svg lucideRefreshCw [size]="18"></svg>{{ retryLabel() }}
      </button>
    </div>
  `,
})
export class PlErrorState {
  readonly heading = input('No pudimos cargar esto');
  readonly message = input('Revisá tu conexión y probá de nuevo.');
  readonly retryLabel = input('Reintentar');
  readonly retry = output<void>();
}
