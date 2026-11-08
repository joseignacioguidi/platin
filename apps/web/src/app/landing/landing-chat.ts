import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LucideMessageCircle } from '@lucide/angular';
import { PlWink } from '@platin/web-ui';
import { LANDING_TEXTS } from './landing.texts';

/** Time between one message and the next as they come in. */
export const MESSAGE_STAGGER_MS = 650;

/**
 * Where the messages stand: `still` shows them all (prerender, no JavaScript, reduced motion or
 * the chat already on screen at hydration); `waiting` hides them until the chat scrolls into view;
 * `in` plays them in, one after the other, once.
 */
export type ChatReveal = 'still' | 'waiting' | 'in';

const HEADING = 'm-0 font-bold leading-[0.95] tracking-[-0.05em]';

/**
 * LAN-03: "Cargá un gasto mandando un mensaje", a full-width band before the closing. The drawn
 * conversation is hidden from screen readers, which read its summary instead; its buttons are
 * drawings (spans), not controls. No Telegram or WhatsApp logos: a generic chat icon in ink.
 */
@Component({
  selector: 'pl-landing-chat',
  imports: [PlWink, LucideMessageCircle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .msg-waiting {
      opacity: 0;
    }
    .msg-in {
      animation: pl-msg-in 0.45s both cubic-bezier(0.2, 1.2, 0.4, 1);
    }
    @keyframes pl-msg-in {
      from {
        opacity: 0;
        transform: translateY(14px) scale(0.96);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .msg-waiting {
        opacity: 1;
      }
      .msg-in {
        animation: none;
      }
    }
  `,
  template: `
    <section
      aria-labelledby="chat-titulo"
      class="border-y-2 border-ink bg-canvas px-4 py-18 sm:px-6 sm:py-24"
    >
      <div class="mx-auto flex max-w-[1192px] flex-wrap items-center gap-14">
        <div class="flex flex-[1_1_420px] flex-col gap-5.5">
          <span
            class="self-start rounded-full border-2 border-ink bg-surface px-3 py-1 text-sm font-extrabold"
            >{{ t.badge }}</span
          >
          <h2 id="chat-titulo" [class]="heading + ' text-[clamp(40px,5vw,68px)]'">
            {{ t.title }}
          </h2>
          <p class="m-0 max-w-[480px] text-lg leading-normal sm:text-[19px]">{{ t.body }}</p>
          <ol class="m-0 hidden list-none flex-col gap-2.5 p-0 text-[17px] sm:flex">
            @for (step of t.steps; track $index) {
              <li class="flex items-baseline gap-3">
                <span class="font-amount font-bold">{{ $index + 1 }}</span>
                {{ step }}
              </li>
            }
          </ol>
          <p class="m-0 text-[17px] font-bold sm:hidden">{{ t.stepsShort }}</p>
          <ul class="m-0 flex list-none flex-wrap gap-2.5 p-0" [attr.aria-label]="t.channelsLabel">
            @for (channel of t.channels; track channel.name) {
              <li
                class="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-ink px-4"
                [class]="channel.available ? 'bg-surface font-bold' : 'border-dashed font-semibold'"
              >
                <svg lucideMessageCircle [size]="16" aria-hidden="true"></svg>
                {{ channel.name }}
              </li>
            }
          </ul>
        </div>

        <div
          class="mx-auto flex min-w-0 max-w-[460px] flex-[1_1_380px] flex-col overflow-hidden rounded-[36px] border-2 border-ink bg-surface"
        >
          <p class="sr-only">{{ t.summary }}</p>
          <div class="flex items-center gap-3 border-b-2 border-ink px-5 py-4" aria-hidden="true">
            <span
              class="flex size-10 items-center justify-center rounded-full border-2 border-ink bg-brand"
            >
              <pl-wink class="w-[18px]" />
            </span>
            <span class="flex flex-col">
              <strong>{{ t.botName }}</strong>
              <span class="text-[13px] text-muted">{{ t.botKind }}</span>
            </span>
          </div>
          <div #conversation class="flex flex-col gap-3 p-5" aria-hidden="true">
            @for (message of t.messages; track $index) {
              @if (message.from === 'me') {
                <div
                  data-chat-message
                  class="max-w-[80%] self-end rounded-[22px_22px_6px_22px] bg-ink px-4 py-3 font-amount text-on-ink"
                  [class.msg-waiting]="reveal() === 'waiting'"
                  [class.msg-in]="reveal() === 'in'"
                  [style.animation-delay.ms]="reveal() === 'in' ? $index * stagger : null"
                >
                  {{ message.parts[0].text }}
                </div>
              } @else {
                <div
                  data-chat-message
                  class="flex max-w-[88%] flex-col gap-2.5 self-start rounded-[22px_22px_22px_6px] border-2 border-ink bg-field px-4 py-3.5 leading-[1.4]"
                  [class.msg-waiting]="reveal() === 'waiting'"
                  [class.msg-in]="reveal() === 'in'"
                  [style.animation-delay.ms]="reveal() === 'in' ? $index * stagger : null"
                >
                  <!-- One span per part with no spaces inside: the text carries its own spacing. -->
                  <span>
                    @for (part of message.parts; track $index) {
                      <span
                        [class]="
                          part.amount
                            ? 'font-amount whitespace-nowrap'
                            : part.strong
                              ? 'font-bold'
                              : ''
                        "
                        >{{ part.text }}</span
                      >
                      @if (part.breakAfter) {
                        <br />
                      }
                    }
                  </span>
                  @if (message.buttons) {
                    <span class="flex flex-wrap gap-2">
                      @for (button of message.buttons; track button; let first = $first) {
                        <span
                          class="inline-flex min-h-10 items-center rounded-full border-2 border-ink px-3.5 text-sm font-bold"
                          [class]="first ? 'bg-brand' : 'bg-surface'"
                          >{{ button }}</span
                        >
                      }
                    </span>
                  }
                </div>
              }
            }
          </div>
          <div
            class="mx-4 mb-4 flex min-h-12 items-center rounded-full border-2 border-ink px-4.5 text-[15px] text-muted"
            aria-hidden="true"
          >
            {{ t.inputHint }}
          </div>
        </div>
      </div>
    </section>
  `,
})
export class LandingChat {
  protected readonly t = LANDING_TEXTS.chat;
  protected readonly heading = HEADING;
  protected readonly stagger = MESSAGE_STAGGER_MS;
  /** Prerendered `still`: the HTML carries every message, visible without JavaScript. */
  protected readonly reveal = signal<ChatReveal>('still');
  private readonly conversation = viewChild.required<ElementRef<HTMLElement>>('conversation');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const element = this.conversation().nativeElement;
      // Already on screen (or above it) when it hydrates: hiding it now would only flicker.
      if (element.getBoundingClientRect().top < innerHeight) return;
      this.reveal.set('waiting');
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          this.reveal.set('in');
        },
        { threshold: 0.35 },
      );
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
