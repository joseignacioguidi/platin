import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideChevronLeft } from '@lucide/angular';
import { ONBOARDING_TEXTS } from './onboarding.texts';

/**
 * The frame of every onboarding step (docs/mockups/onboarding): 4-segment progress, "Volver",
 * title, the step and a foot with "Seguir" and "Saltear este paso". On a desktop, a centered
 * 560 px column. The step projects its body and its `[footer]` buttons.
 */
@Component({
  selector: 'pl-onboarding-shell',
  imports: [LucideChevronLeft],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mx-auto flex min-h-dvh w-full max-w-[560px] flex-col' },
  template: `
    <div class="flex items-center gap-2 px-4 pt-4">
      @if (canGoBack()) {
        <button
          type="button"
          class="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-field"
          [attr.aria-label]="t.back"
          (click)="back.emit()"
        >
          <svg lucideChevronLeft [size]="22" aria-hidden="true"></svg>
        </button>
      } @else {
        <span class="size-11 shrink-0" aria-hidden="true"></span>
      }
      <div
        role="progressbar"
        class="flex flex-1 gap-1.5"
        [attr.aria-label]="t.progress(step())"
        aria-valuemin="1"
        aria-valuemax="4"
        [attr.aria-valuenow]="step()"
      >
        @for (segment of segments(); track $index) {
          <span class="h-1.5 flex-1 rounded-full" [class]="segment ? 'bg-ink' : 'bg-line'"></span>
        }
      </div>
      <span
        class="w-11 shrink-0 text-right font-amount text-[13px] text-muted"
        aria-hidden="true"
        >{{ t.progressShort(step()) }}</span
      >
    </div>

    @if (heading()) {
      <header class="flex flex-col gap-2 px-5 pt-5">
        <h1 class="text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em]">{{ heading() }}</h1>
        @if (body()) {
          <p class="text-[15px] leading-[1.45] text-muted">{{ body() }}</p>
        }
      </header>
    }

    <div class="flex flex-1 flex-col gap-[18px] p-5">
      <ng-content />
    </div>

    <div
      class="sticky bottom-0 flex flex-col gap-1.5 border-t border-line bg-canvas px-4 pt-3"
      style="padding-bottom: max(24px, env(safe-area-inset-bottom))"
    >
      <ng-content select="[footer]" />
    </div>
  `,
})
export class OnboardingShell {
  protected readonly t = ONBOARDING_TEXTS;
  /** 1 to 4. */
  readonly step = input.required<number>();
  readonly heading = input<string | null>(null);
  readonly body = input<string | null>(null);
  readonly canGoBack = input(true);
  readonly back = output<void>();

  protected readonly segments = computed(() => [1, 2, 3, 4].map((n) => n <= this.step()));
}

/** Classes of the foot buttons, as in the mockups. */
export const FOOT_PRIMARY =
  'min-h-[52px] w-full rounded-2xl bg-ink text-base font-bold text-on-ink hover:opacity-90 disabled:opacity-50';
export const FOOT_SECONDARY =
  'min-h-11 w-full rounded-xl text-[15px] font-semibold text-muted hover:bg-field';
