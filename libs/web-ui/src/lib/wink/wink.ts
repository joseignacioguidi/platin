import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The platin wink face (docs/brand/glifo-guino.svg), drawn with `currentColor`:
 * set the size and color on the host (`class="w-24 text-brand"`).
 * With `animated`, the right eye blinks open and winks again; it stays still
 * (winking) under `prefers-reduced-motion`.
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
    .eye-open {
      opacity: 0;
      transform-box: fill-box;
      transform-origin: center;
    }
    .animated .eye-open {
      animation: pl-eye-open 2.4s infinite;
    }
    .animated .eye-wink {
      animation: pl-eye-wink 2.4s infinite;
    }
    @keyframes pl-eye-open {
      0%,
      62% {
        opacity: 1;
        transform: scaleY(1);
      }
      66%,
      90% {
        opacity: 0;
        transform: scaleY(0.1);
      }
      94%,
      100% {
        opacity: 1;
        transform: scaleY(1);
      }
    }
    @keyframes pl-eye-wink {
      0%,
      64% {
        opacity: 0;
      }
      66%,
      90% {
        opacity: 1;
      }
      92%,
      100% {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .animated .eye-open,
      .animated .eye-wink {
        animation: none;
      }
    }
  `,
  template: `
    <svg viewBox="252 270 524 638" [class.animated]="animated()" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path
          stroke-width="96"
          d="M612 548 C584 512 540 494 488 494 C416 494 366 526 366 572 C366 620 416 636 488 648 C560 660 612 680 612 726 C612 772 560 804 488 804 C434 804 388 786 360 750"
        />
        <path stroke-width="88" d="M488 418 V494 M488 804 V858" />
        <path class="eye-wink" stroke-width="60" d="M596 386 Q648 322 742 338" />
      </g>
      <circle cx="314" cy="372" r="54" fill="currentColor" />
      <circle class="eye-open" cx="662" cy="372" r="54" fill="currentColor" />
    </svg>
  `,
})
export class PlWink {
  /** Blinks the right eye in a loop (still under reduced motion). */
  readonly animated = input(false);
  /** Accessible name; without it the face is decorative. */
  readonly label = input<string>();
}
