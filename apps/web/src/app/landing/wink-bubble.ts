import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

export type BubbleMessage = readonly { text: string; amount?: boolean }[];

const TYPE_MS = 38;
const ERASE_MS = 14;
const HOLD_MS = 3200;
const GAP_MS = 350;
const FIRST_WINK_MS = 900;

function lengthOf(message: BubbleMessage): number {
  return message.reduce((total, part) => total + part.text.length, 0);
}

/**
 * The wink's speech bubble: types its messages one by one, holds each and erases it.
 * Prerendered with the first message complete; the typing starts in the browser and never runs
 * under `prefers-reduced-motion`. Screen readers get the first message only (no letter by letter).
 */
@Component({
  selector: 'pl-wink-bubble',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .caret {
      display: inline-block;
      width: 2px;
      height: 1.1em;
      margin-left: 1px;
      vertical-align: -0.15em;
      background: currentColor;
      animation: pl-caret 0.8s steps(1) infinite;
    }
    @keyframes pl-caret {
      50% {
        opacity: 0;
      }
    }
  `,
  template: `
    <span class="sr-only">{{ plainFirst() }}</span>
    <span aria-hidden="true">
      <!-- One span per part with no spaces inside: the text carries its own spacing. -->
      @for (part of visible(); track $index) {
        <span [class]="part.amount ? 'font-amount whitespace-nowrap font-semibold' : ''">{{
          part.text
        }}</span>
      }
      @if (typing()) {
        <span class="caret"></span>
      }
    </span>
  `,
})
export class WinkBubble {
  readonly messages = input.required<readonly BubbleMessage[]>();
  /** Each time a message starts (the first one on load): the face winks along. */
  readonly said = output<number>();

  private readonly index = signal(0);
  /** Characters of the current message on screen. */
  private readonly shown = signal(Number.POSITIVE_INFINITY);
  protected readonly typing = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly plainFirst = computed(() =>
    (this.messages()[0] ?? []).map((part) => part.text).join(''),
  );

  /** The current message cut at `shown` characters, keeping its parts. */
  protected readonly visible = computed(() => {
    let left = this.shown();
    const parts: { text: string; amount?: boolean }[] = [];
    for (const part of this.messages()[this.index()] ?? []) {
      if (left <= 0) break;
      parts.push({ ...part, text: part.text.slice(0, left) });
      left -= part.text.length;
    }
    return parts;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (this.messages().length < 2) return;
      this.shown.set(lengthOf(this.messages()[0]));
      // The first message is already on screen: wink once the bubble has popped in.
      this.later(FIRST_WINK_MS, () => {
        this.said.emit(0);
        this.later(HOLD_MS, () => this.erase());
      });
    });
  }

  private erase(): void {
    this.typing.set(true);
    if (this.shown() > 0) {
      this.shown.update((count) => count - 1);
      this.later(ERASE_MS, () => this.erase());
      return;
    }
    this.index.update((index) => (index + 1) % this.messages().length);
    this.later(GAP_MS, () => {
      this.said.emit(this.index());
      this.type();
    });
  }

  private type(): void {
    const total = lengthOf(this.messages()[this.index()]);
    if (this.shown() < total) {
      this.shown.update((count) => count + 1);
      this.later(TYPE_MS, () => this.type());
      return;
    }
    this.typing.set(false);
    this.later(HOLD_MS, () => this.erase());
  }

  private later(ms: number, step: () => void): void {
    this.timer = setTimeout(step, ms);
  }
}
