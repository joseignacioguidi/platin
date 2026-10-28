import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlButton, PlWink } from '@platin/web-ui';
import { LAYOUT_TEXTS } from './layout.texts';

/** Full-screen wait while the free server boots. */
@Component({
  selector: 'pl-wake-screen',
  imports: [PlButton, PlWink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed inset-0 z-50 flex items-center justify-center bg-canvas px-8' },
  template: `
    <div
      class="flex max-w-sm flex-col items-center gap-5 text-center"
      role="status"
      aria-live="polite"
    >
      <pl-wink class="w-16 text-brand" [animated]="!failed()" />
      <h1 class="text-xl font-bold">{{ texts.wakeTitle }}</h1>
      <p class="text-[15px] text-muted">{{ failed() ? texts.wakeFailed : texts.wakeBody }}</p>
      @if (failed()) {
        <button plButton type="button" (click)="reload()">{{ texts.retry }}</button>
      }
    </div>
  `,
})
export class WakeScreen {
  readonly failed = input(false);
  protected readonly texts = LAYOUT_TEXTS;

  protected reload(): void {
    location.reload();
  }
}
