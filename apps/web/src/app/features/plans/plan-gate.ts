import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  ViewContainerRef,
} from '@angular/core';
import type { LimitedResource } from '@platin/domain';
import { PlPlanBadge } from '@platin/web-ui';
import { type PlanBlock, type PlanGateKey, PlanStore } from './plan.store';
import { PLANS_TEXTS } from './plans.texts';

let nextGateId = 0;

/** Opens the plan sheet (loaded on demand, like the interceptor does). */
export function showPlanBlock(injector: Injector, block: PlanBlock): void {
  void import('./plan-sheet').then(({ openPlanSheet }) => openPlanSheet(injector, block));
}

/**
 * PLN-07, on a button, link or option: if the plan doesn't allow it, adds the mark of the plan
 * that does ("Pro"), announces it to screen readers and turns the click into the plan sheet,
 * without running the original action (the click handler or the router link). The API and the
 * plan interceptor stay as the safety net.
 */
@Directive({
  selector: '[plPlanGate]',
  host: { '[attr.data-plan-blocked]': 'blocked() ? "" : null' },
})
export class PlanGate {
  /** What it needs: a feature, one more of a resource, or several (all must be allowed). */
  readonly plPlanGate = input.required<PlanGateKey | readonly PlanGateKey[]>();
  /** `false` hides the mark (when the place shows it in another way). */
  readonly plPlanGateBadge = input(true);

  private readonly store = inject(PlanStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewContainer = inject(ViewContainerRef);
  private badge: ComponentRef<PlPlanBadge> | null = null;
  private readonly badgeId = `pl-plan-gate-${++nextGateId}`;

  protected readonly blocked = computed(() => this.store.block(this.plPlanGate()));

  constructor() {
    effect(() => {
      const block = this.blocked();
      this.renderBadge(block && this.plPlanGateBadge() ? block : null);
    });
    // Capture phase: runs before the element's own (click) and RouterLink handlers.
    const element = this.host.nativeElement;
    const onClick = (event: Event) => {
      const block = this.blocked();
      if (!block) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showPlanBlock(this.injector, block);
    };
    element.addEventListener('click', onClick, { capture: true });
    inject(DestroyRef).onDestroy(() => {
      element.removeEventListener('click', onClick, { capture: true });
      this.badge?.destroy();
    });
  }

  private renderBadge(block: PlanBlock | null): void {
    const element = this.host.nativeElement;
    if (!block) {
      this.badge?.destroy();
      this.badge = null;
      if (element.getAttribute('aria-describedby') === this.badgeId) {
        element.removeAttribute('aria-describedby');
      }
      return;
    }
    if (!this.badge) {
      this.badge = this.viewContainer.createComponent(PlPlanBadge);
      // The mark lives inside the button so it reads as part of it.
      const badgeElement = this.badge.location.nativeElement as HTMLElement;
      badgeElement.id = this.badgeId;
      element.appendChild(badgeElement);
      // An aria-label hides the content from screen readers: the mark goes as the description.
      if (element.hasAttribute('aria-label') && !element.hasAttribute('aria-describedby')) {
        element.setAttribute('aria-describedby', this.badgeId);
      }
    }
    this.badge.setInput('plan', block.upgrade);
    this.badge.setInput('srLabel', PLANS_TEXTS.gate.locked(block.upgrade));
  }
}

/** "2 de 2 cuentas" next to a create button (PLN-07). Nothing when the resource is unlimited. */
@Component({
  selector: 'pl-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (usage(); as usage) {
      <span
        class="font-amount text-xs whitespace-nowrap"
        [class.text-muted]="usage.used < usage.limit"
        [class.text-pending-ink]="usage.used >= usage.limit"
      >
        {{ texts.usage(usage.used, usage.limit, resource()) }}
      </span>
    }
  `,
})
export class PlUsage {
  readonly resource = input.required<LimitedResource>();
  private readonly store = inject(PlanStore);
  protected readonly texts = PLANS_TEXTS;
  protected readonly usage = computed(() => this.store.usage(this.resource()));
}
