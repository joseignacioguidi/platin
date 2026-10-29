import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';

/**
 * The platin wink face (docs/brand/glifo-guino.svg), drawn with `currentColor`:
 * set the size and color on the host (`class="w-24 text-brand"`).
 * With `animated` (a loop) or `winkTrigger` (once per change), the open right eye squashes
 * shut, the wink draws itself in with a small bounce, holds, and unwinds back into the eye.
 * Under `prefers-reduced-motion` it stays still, winking.
 */
@Component({
  selector: 'pl-wink',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-block',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  styles: `
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .eye-open,
    .eye-wink {
      transform-box: fill-box;
      transform-origin: center;
    }
    .eye-open {
      opacity: 0;
    }
    /* The wink is a bit smaller than in the static brand glyph. */
    .eye-wink {
      scale: 0.82;
      stroke-dasharray: 1;
      stroke-dashoffset: 0;
    }
    .animated .eye-open {
      animation: pl-eye-open 3.2s infinite;
    }
    .animated .eye-wink {
      animation: pl-eye-wink 3.2s infinite;
    }
    @keyframes pl-eye-open {
      0%,
      50% {
        opacity: 1;
        transform: scaleY(1);
      }
      56% {
        opacity: 1;
        transform: scaleY(0.12);
        animation-timing-function: ease-in;
      }
      58%,
      84% {
        opacity: 0;
        transform: scaleY(0.12);
      }
      86% {
        opacity: 1;
        transform: scaleY(0.12);
        animation-timing-function: cubic-bezier(0.2, 1.6, 0.4, 1);
      }
      94%,
      100% {
        opacity: 1;
        transform: scaleY(1);
      }
    }
    @keyframes pl-eye-wink {
      0%,
      55% {
        opacity: 0;
        stroke-dashoffset: 1;
        rotate: 0deg;
      }
      56% {
        opacity: 1;
        stroke-dashoffset: 1;
        animation-timing-function: cubic-bezier(0.3, 0, 0.2, 1);
      }
      64% {
        stroke-dashoffset: 0;
        rotate: -10deg;
        animation-timing-function: cubic-bezier(0.2, 1.6, 0.4, 1);
      }
      71%,
      82% {
        opacity: 1;
        stroke-dashoffset: 0;
        rotate: 0deg;
      }
      86% {
        opacity: 1;
        stroke-dashoffset: 1;
      }
      87%,
      100% {
        opacity: 0;
        stroke-dashoffset: 1;
      }
    }
    /* On demand: eyes open at rest, one wink each time winkTrigger changes. */
    .awake .eye-open {
      opacity: 1;
    }
    .awake .eye-wink {
      opacity: 0;
    }
    .awake.once .eye-open {
      animation: pl-eye-open-once 1.4s;
    }
    .awake.once .eye-wink {
      animation: pl-eye-wink-once 1.4s;
    }
    /* The same movement as the loop, from the open eye back to it. */
    @keyframes pl-eye-open-once {
      0% {
        opacity: 1;
        transform: scaleY(1);
      }
      13.6% {
        opacity: 1;
        transform: scaleY(0.12);
        animation-timing-function: ease-in;
      }
      18.2%,
      77.3% {
        opacity: 0;
        transform: scaleY(0.12);
      }
      81.8% {
        opacity: 1;
        transform: scaleY(0.12);
        animation-timing-function: cubic-bezier(0.2, 1.6, 0.4, 1);
      }
      100% {
        opacity: 1;
        transform: scaleY(1);
      }
    }
    @keyframes pl-eye-wink-once {
      0%,
      11.4% {
        opacity: 0;
        stroke-dashoffset: 1;
        rotate: 0deg;
      }
      13.6% {
        opacity: 1;
        stroke-dashoffset: 1;
        animation-timing-function: cubic-bezier(0.3, 0, 0.2, 1);
      }
      31.8% {
        stroke-dashoffset: 0;
        rotate: -10deg;
        animation-timing-function: cubic-bezier(0.2, 1.6, 0.4, 1);
      }
      47.7%,
      72.7% {
        opacity: 1;
        stroke-dashoffset: 0;
        rotate: 0deg;
      }
      81.8% {
        opacity: 1;
        stroke-dashoffset: 1;
      }
      84.1%,
      100% {
        opacity: 0;
        stroke-dashoffset: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .animated .eye-open,
      .animated .eye-wink,
      .awake.once .eye-open,
      .awake.once .eye-wink {
        animation: none;
      }
      /* Still: winking, as everywhere else. */
      .awake .eye-open {
        opacity: 0;
      }
      .awake .eye-wink {
        opacity: 1;
      }
    }
  `,
  template: `
    <svg
      #svg
      viewBox="252 270 524 638"
      [class.animated]="animated()"
      [class.awake]="winkTrigger() !== null"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path
          stroke-width="96"
          d="M612 548 C584 512 540 494 488 494 C416 494 366 526 366 572 C366 620 416 636 488 648 C560 660 612 680 612 726 C612 772 560 804 488 804 C434 804 388 786 360 750"
        />
        <path stroke-width="88" d="M488 418 V494 M488 804 V858" />
        <path class="eye-wink" stroke-width="60" pathLength="1" d="M596 386 Q648 322 742 338" />
      </g>
      <circle cx="314" cy="372" r="54" fill="currentColor" />
      <circle class="eye-open" cx="662" cy="372" r="54" fill="currentColor" />
    </svg>
  `,
})
export class PlWink {
  /** Plays the eye-to-wink animation in a loop (still under reduced motion). */
  readonly animated = input(false);
  /**
   * On-demand mode: with a number the eye rests open and winks once every time it changes
   * (to sync the wink with something else, like the landing bubble). `null` = off.
   */
  readonly winkTrigger = input<number | null>(null);
  /** Accessible name; without it the face is decorative. */
  readonly label = input<string>();

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  constructor() {
    effect(() => {
      // 0 or null: nothing to play (also keeps prerendering away from the DOM APIs below).
      if (!this.winkTrigger()) return;
      const svg = this.svg().nativeElement;
      // Restart the one-shot animation: drop the class, force a style flush, add it back.
      svg.classList.remove('once');
      void svg.getBoundingClientRect();
      svg.classList.add('once');
    });
  }
}
