import {
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  FlexibleConnectedPositionStrategyOrigin,
  OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  Injectable,
  Injector,
  input,
  signal,
} from '@angular/core';
import type { Currency } from '@platin/domain';
import { HideAmounts } from '../money/hide-amounts';
import { moneyText, PlMoney } from '../money/money';

/**
 * What a tooltip shows: a label and an amount (with pl-money) or a plain value (counts), or a
 * label and a sentence that explains it (plInfoTip).
 */
export interface PlChartTip {
  label: string;
  amount: string | null;
  currency: Currency;
  value: string | null;
  text?: string | null;
}

let nextTipId = 0;

/** The floating panel: label on top, the exact value below. */
@Component({
  selector: 'pl-chart-tooltip',
  imports: [PlMoney],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tip(); as tip) {
      <div
        role="tooltip"
        [id]="id()"
        class="pointer-events-none flex max-w-64 flex-col gap-0.5 rounded-xl bg-ink px-3 py-2 text-on-ink shadow-lg"
      >
        <span class="text-xs opacity-80">{{ tip.label }}</span>
        @if (tip.text) {
          <span class="text-sm leading-snug">{{ tip.text }}</span>
        } @else if (tip.amount !== null) {
          <pl-money
            class="text-[15px] font-semibold"
            [amount]="tip.amount"
            [currency]="tip.currency"
          />
        } @else {
          <span class="font-amount text-[15px] font-semibold">{{ tip.value }}</span>
        }
      </div>
    }
  `,
})
export class PlChartTooltip {
  readonly tip = signal<PlChartTip | null>(null);
  readonly id = signal('');
}

/**
 * DAS-06: one tooltip at a time for every chart. It follows the pointer, or sits next to the
 * focused or tapped element, and never leaves the screen. Escape or a tap outside closes it.
 */
@Injectable({ providedIn: 'root' })
export class PlChartTooltips {
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private overlay: OverlayRef | null = null;
  private panel: PlChartTooltip | null = null;
  private owner: HTMLElement | null = null;

  /** Id of the panel while it describes `owner`, for aria-describedby. */
  readonly describedBy = signal<{ owner: HTMLElement; id: string } | null>(null);

  show(owner: HTMLElement, tip: PlChartTip, at: FlexibleConnectedPositionStrategyOrigin): void {
    if (!this.overlay) this.create();
    const overlay = this.overlay as OverlayRef;
    this.owner = owner;
    overlay.updatePositionStrategy(this.position(at));
    if (!overlay.hasAttached()) {
      this.panel = overlay.attach(new ComponentPortal(PlChartTooltip)).instance;
      this.panel.id.set(`pl-chart-tip-${++nextTipId}`);
    }
    this.panel?.tip.set(tip);
    this.describedBy.set({ owner, id: this.panel?.id() ?? '' });
    overlay.updatePosition();
  }

  hide(owner?: HTMLElement): void {
    if (owner && owner !== this.owner) return;
    this.overlay?.detach();
    this.owner = null;
    this.panel = null;
    this.describedBy.set(null);
  }

  isShownFor(owner: HTMLElement): boolean {
    return this.owner === owner && !!this.overlay?.hasAttached();
  }

  private create(): void {
    this.overlay = createOverlayRef(this.injector, {
      scrollStrategy: createRepositionScrollStrategy(this.injector),
      panelClass: 'pl-chart-tooltip-panel',
    });
    // A tap or click outside the element that opened it closes it; so does Escape.
    this.document.addEventListener(
      'pointerdown',
      (event) => {
        if (this.owner && !this.owner.contains(event.target as Node)) this.hide();
      },
      true,
    );
    this.document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.owner) this.hide();
    });
  }

  private position(at: FlexibleConnectedPositionStrategyOrigin) {
    return createFlexibleConnectedPositionStrategy(this.injector, at)
      .withPositions([
        { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -10 },
        { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 10 },
      ])
      .withPush(true)
      .withViewportMargin(8)
      .withFlexibleDimensions(false);
  }
}

/**
 * Makes a bar, segment or point of a chart show its exact value (DAS-06): focusable, with an
 * aria-label "label: value", and the shared tooltip on hover, focus and tap. Amounts go through
 * pl-money, so "ocultar montos" hides them in the tooltip and in the label too.
 */
@Directive({
  selector: '[plChartPoint]',
  host: {
    role: 'img',
    tabindex: '0',
    class:
      'cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    '[attr.aria-label]': 'ariaLabel()',
    '[attr.aria-describedby]': 'describedBy()',
    '(mouseenter)': 'showAtPointer($event)',
    '(mousemove)': 'showAtPointer($event)',
    '(mouseleave)': 'hide()',
    '(focus)': 'showAtElement()',
    '(blur)': 'hide()',
    // Touch has no hover: a tap opens it next to the element; a tap outside closes it.
    '(click)': 'showAtElement()',
  },
})
export class PlChartPoint {
  /** What the value is: the month, category, pocket… */
  readonly plChartPoint = input.required<string>();
  /** Decimal string shown with pl-money. */
  readonly amount = input<string | null>(null);
  readonly currency = input<Currency>('ARS');
  /** A plain value instead of an amount ("12 usuarios"). */
  readonly value = input<string | null>(null);

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tooltips = inject(PlChartTooltips);
  private readonly hideAmounts = inject(HideAmounts);

  protected readonly ariaLabel = computed(() => {
    const amount = this.amount();
    const shown =
      amount !== null
        ? moneyText(amount, this.currency(), this.hideAmounts.hidden())
        : (this.value() ?? '');
    return `${this.plChartPoint()}: ${shown}`;
  });
  protected readonly describedBy = computed(() => {
    const current = this.tooltips.describedBy();
    return current?.owner === this.element ? current.id : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.tooltips.hide(this.element));
  }

  protected showAtPointer(event: MouseEvent): void {
    this.tooltips.show(this.element, this.tip(), { x: event.clientX, y: event.clientY });
  }

  protected showAtElement(): void {
    this.tooltips.show(this.element, this.tip(), this.element);
  }

  protected hide(): void {
    this.tooltips.hide(this.element);
  }

  private tip(): PlChartTip {
    return {
      label: this.plChartPoint(),
      amount: this.amount(),
      currency: this.currency(),
      value: this.value(),
    };
  }
}

/**
 * A help button that explains a term in the shared tooltip, on hover, focus and tap. Like the
 * chart points, a tap outside, Escape or leaving closes it. Put it on a real `<button>` with an
 * aria-label.
 */
@Directive({
  selector: 'button[plInfoTip]',
  host: {
    type: 'button',
    '[attr.aria-describedby]': 'describedBy()',
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focus)': 'show()',
    '(blur)': 'hide()',
    // Touch has no hover; it doesn't reach a row the button sits on either.
    '(click)': 'show(); $event.stopPropagation()',
  },
})
export class PlInfoTip {
  /** The sentence that explains the term. */
  readonly plInfoTip = input.required<string>();
  /** The term, shown on top. */
  readonly term = input.required<string>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tooltips = inject(PlChartTooltips);

  protected readonly describedBy = computed(() => {
    const current = this.tooltips.describedBy();
    return current?.owner === this.element ? current.id : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.tooltips.hide(this.element));
  }

  protected show(): void {
    this.tooltips.show(
      this.element,
      { label: this.term(), amount: null, currency: 'ARS', value: null, text: this.plInfoTip() },
      this.element,
    );
  }

  protected hide(): void {
    this.tooltips.hide(this.element);
  }
}
