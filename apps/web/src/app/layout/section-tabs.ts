import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PlanGate } from '../features/plans/plan-gate';
import type { PlanGateKey } from '../features/plans/plan.store';
import { LAYOUT_TEXTS } from './layout.texts';
import { PENDING_BADGE_CLASS } from './pending-count';

export interface SectionTab {
  /** Absolute path of the child route. */
  path: string;
  label: string;
  /** "2" next to the label (COM-05); nothing when null. */
  count?: string | null;
  /** PLN-07: outside the plan the tab shows the mark and opens the plan sheet. */
  gate?: PlanGateKey;
}

/**
 * Tabs that are links (COM-05, INV-06): each one a child route, with the look of
 * `pl-segmented`. Links and not ARIA tabs, so the browser history and deep links work.
 */
@Component({
  selector: 'pl-section-tabs',
  imports: [RouterLink, RouterLinkActive, PlanGate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <nav
      [attr.aria-label]="label()"
      class="grid max-w-160 auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-line-soft p-1"
    >
      @for (tab of tabs(); track tab.path; let first = $first) {
        <a
          [routerLink]="tab.path"
          [plPlanGate]="tab.gate ?? []"
          routerLinkActive
          [routerLinkActiveOptions]="{ exact: first }"
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-center text-[15px] leading-tight font-semibold text-ink transition-colors hover:bg-surface/60 aria-[current=page]:bg-surface aria-[current=page]:font-bold aria-[current=page]:shadow-sm"
        >
          {{ tab.label }}
          @if (tab.count; as count) {
            <span [class]="badgeClass" [attr.aria-label]="texts.pending(count)">{{ count }}</span>
          }
        </a>
      }
    </nav>
  `,
})
export class SectionTabs {
  readonly tabs = input.required<readonly SectionTab[]>();
  readonly label = input.required<string>();
  protected readonly badgeClass = PENDING_BADGE_CLASS;
  protected readonly texts = LAYOUT_TEXTS.nav;
}
