import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * PLN-07: the mark of the plan that includes something ("Pro"). Purely visual: whoever places it
 * also announces the block to screen readers (see `srLabel`).
 */
@Component({
  selector: 'pl-plan-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <span
      class="inline-flex items-center rounded-full bg-pending px-2 py-0.5 text-[11px] leading-4 font-semibold tracking-wide text-black"
      [attr.aria-hidden]="srLabel() ? null : true"
    >
      <span aria-hidden="true">{{ plan() }}</span>
      @if (srLabel()) {
        <span class="sr-only">{{ srLabel() }}</span>
      }
    </span>
  `,
})
export class PlPlanBadge {
  /** Name of the plan that includes it. */
  readonly plan = input.required<string>();
  /** Text for screen readers ("No incluido en tu plan; está en Pro"); none = decorative. */
  readonly srLabel = input<string | null>(null);
}
