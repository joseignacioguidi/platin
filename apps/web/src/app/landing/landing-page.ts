import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlWink } from '@platin/web-ui';
import { sessionHint } from '../core/auth/session-hint';
import { LANDING_TEXTS } from './landing.texts';
import { WinkBubble } from './wink-bubble';

/** Heights (%) and fills of the installments chart: the bars drop as plans end. */
const INSTALLMENT_BARS = [
  { height: 100, fill: 'bg-card' },
  { height: 82, fill: 'bg-card-muted' },
  { height: 82, fill: 'bg-card-muted' },
  { height: 82, fill: 'bg-card-muted' },
  { height: 82, fill: 'bg-card-muted' },
  { height: 49, fill: 'bg-surface' },
] as const;

const HEADING = 'm-0 font-bold leading-[0.95] tracking-[-0.05em]';
const QUESTION_CARD =
  'flex flex-wrap items-center gap-10 rounded-[36px] p-[clamp(28px,4vw,56px)] max-sm:gap-8';
const ROW =
  'flex items-center justify-between gap-4 rounded-[18px] border-2 border-ink px-5 py-4 text-[17px]';

/**
 * LAN-01: public landing, prerendered and always light. Coral, sky and rose are used only here.
 * One main movement: the wink in the hero (with its bubble typing what platin tells you) and the
 * floating stickers;
 * everything stays still under `prefers-reduced-motion`.
 */
@Component({
  selector: 'pl-landing-page',
  imports: [RouterLink, PlWink, WinkBubble],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pl-light block min-h-dvh overflow-x-clip bg-surface text-ink' },
  styles: `
    .bubble {
      animation: pl-pop 0.5s 0.5s both cubic-bezier(0.2, 1.4, 0.4, 1);
    }
    .sticker {
      animation: pl-float 6s ease-in-out infinite;
    }
    @keyframes pl-pop {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.92);
      }
    }
    @keyframes pl-float {
      50% {
        translate: 0 -10px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bubble,
      .sticker {
        animation: none;
      }
    }
  `,
  template: `
    <header class="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 sm:py-6">
      <nav
        [attr.aria-label]="t.nav"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        <a
          routerLink="/"
          class="flex min-h-11 items-center gap-2.5 text-2xl font-bold tracking-[-0.05em]"
        >
          <pl-wink class="w-6" />
          {{ t.brand }}
        </a>
        <div class="flex items-center gap-1 sm:gap-2">
          <a
            href="#preguntas"
            class="hidden min-h-11 items-center px-4 font-semibold hover:text-brand-strong sm:flex"
            >{{ t.howItWorks }}</a
          >
          <a
            routerLink="/planes"
            class="hidden min-h-11 items-center px-4 font-semibold hover:text-brand-strong sm:flex"
            >{{ t.plans }}</a
          >
          @if (hasSession()) {
            <a
              routerLink="/app"
              class="flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-ink bg-brand px-5 font-bold hover:bg-brand-soft"
              >{{ t.openApp }}</a
            >
          } @else {
            <a
              routerLink="/ingresar"
              class="flex min-h-11 items-center whitespace-nowrap px-3 font-semibold hover:text-brand-strong sm:px-4"
              >{{ t.login }}</a
            >
            <a
              routerLink="/registro"
              class="flex min-h-11 items-center whitespace-nowrap rounded-full border-2 border-ink bg-brand px-5 font-bold hover:bg-brand-soft"
              >{{ t.register }}</a
            >
          }
        </div>
      </nav>
    </header>

    <main>
      <section
        class="mx-auto flex max-w-[1240px] flex-col items-center gap-7 px-4 pb-18 pt-6 text-center sm:px-6 sm:pt-10"
      >
        <div class="relative flex flex-col items-center gap-4 sm:block sm:pr-2">
          <pl-wink class="w-[150px] sm:w-[190px]" [winkTrigger]="winks()" [label]="t.faceLabel" />
          <p
            class="bubble m-0 min-h-[84px] w-[250px] rounded-[26px_26px_26px_6px] border-2 border-ink bg-surface px-5 py-4 text-left leading-snug sm:absolute sm:left-full sm:top-1.5"
          >
            <pl-wink-bubble [messages]="t.bubbles" (said)="winks.update((n) => n + 1)" />
          </p>
        </div>

        <h1 class="m-0 text-[clamp(56px,10vw,152px)] font-bold leading-[0.88] tracking-[-0.06em]">
          {{ t.taglineTop }}<br />{{ t.taglineBottom }}
        </h1>
        <p class="m-0 max-w-[560px] text-lg leading-normal sm:text-xl">{{ t.pitch }}</p>
        <a
          routerLink="/registro"
          class="flex min-h-14 items-center rounded-full bg-ink px-8 text-lg font-bold text-on-ink hover:opacity-90"
          >{{ t.registerFree }}</a
        >

        <div
          class="mt-8 flex max-w-[1100px] flex-wrap items-center justify-center gap-6"
          aria-hidden="true"
        >
          <div
            class="sticker flex -rotate-6 flex-col gap-1 rounded-[22px] border-2 border-ink bg-coral px-5.5 py-4.5 text-left"
          >
            <span class="text-sm font-semibold">{{ t.stickers.expenseLabel }}</span>
            <span class="font-amount text-[26px] font-semibold">{{
              t.stickers.expenseAmount
            }}</span>
          </div>
          <div
            class="sticker flex min-w-[220px] rotate-4 flex-col gap-2 rounded-[22px] border-2 border-ink bg-card px-5.5 py-4.5 text-left [animation-delay:-1.5s]"
          >
            <span class="flex justify-between text-sm font-semibold">
              <span>{{ t.stickers.installmentsLabel }}</span>
              <span class="font-amount">{{ t.stickers.installmentsCount }}</span>
            </span>
            <span class="block h-2.5 rounded-full bg-surface">
              <span class="block h-2.5 w-1/3 rounded-full bg-ink"></span>
            </span>
          </div>
          <div
            class="sticker flex rotate-7 flex-col gap-1 rounded-[22px] border-2 border-ink bg-sky px-5.5 py-4.5 text-left [animation-delay:-4.2s]"
          >
            <span class="text-sm font-semibold">{{ t.stickers.goalLabel }}</span>
            <span class="font-amount text-[26px] font-semibold">{{ t.stickers.goalAmount }}</span>
          </div>
          <div
            class="sticker -rotate-5 rounded-full border-2 border-ink bg-pending px-5 py-4 font-bold [animation-delay:-2.4s]"
          >
            {{ t.stickers.pending }}
          </div>
          <div
            class="sticker flex rotate-3 flex-col gap-0.5 rounded-[22px] border-2 border-ink bg-rose px-5 py-4 text-left [animation-delay:-5s]"
          >
            <span class="text-sm font-semibold">{{ t.stickers.reserveLabel }}</span>
            <span class="font-amount text-2xl font-semibold">{{ t.stickers.reserveAmount }}</span>
          </div>
        </div>
      </section>

      <!-- Below the fold: prerendered, hydrated only when it scrolls into view. -->
      @defer (hydrate on viewport) {
        <section
          id="preguntas"
          class="mx-auto flex max-w-[1240px] scroll-mt-4 flex-col gap-8 px-4 pb-10 pt-16 sm:px-6 sm:pt-24"
          aria-labelledby="preguntas-titulo"
        >
          <h2
            id="preguntas-titulo"
            [class]="heading + ' mb-4 max-w-[760px] text-[clamp(40px,5vw,64px)]'"
          >
            {{ t.questionsTitle }}
          </h2>

          <article [class]="questionCard + ' bg-brand-soft'">
            <div class="flex flex-[1_1_420px] flex-col gap-4">
              <h3 [class]="heading + ' text-[clamp(34px,4vw,52px)]'">{{ t.free.title }}</h3>
              <p class="m-0 max-w-[480px] text-lg leading-normal sm:text-[19px]">
                {{ t.free.body }}
              </p>
            </div>
            <div class="flex flex-[1_1_300px] flex-col gap-3.5">
              <span
                class="font-amount text-[clamp(44px,5vw,64px)] font-semibold tracking-[-0.04em]"
                >{{ t.free.amount }}</span
              >
              <div role="img" [attr.aria-label]="t.free.barAria" class="flex h-[18px] gap-1">
                <div class="w-[41%] rounded-[9px_3px_3px_9px] border-2 border-ink bg-expense"></div>
                <div class="w-[36%] rounded-[3px] border-2 border-ink bg-card"></div>
                <div class="w-[23%] rounded-[3px_9px_9px_3px] border-2 border-ink bg-brand"></div>
              </div>
              <div class="flex flex-wrap gap-4 text-[15px]" aria-hidden="true">
                <span>{{ t.free.spent }}</span>
                <span>{{ t.free.committed }}</span>
                <span class="font-bold">{{ t.free.left }}</span>
              </div>
            </div>
          </article>

          <article [class]="questionCard + ' flex-wrap-reverse bg-card-soft'">
            <div
              class="grid h-[180px] flex-[1_1_300px] grid-cols-6 items-end gap-2.5"
              role="img"
              [attr.aria-label]="t.installments.chartAria"
            >
              @for (bar of bars; track $index) {
                <div
                  class="rounded-xl border-2 border-ink"
                  [class]="bar.fill"
                  [style.height.%]="bar.height"
                ></div>
              }
            </div>
            <div class="flex flex-[1_1_420px] flex-col gap-4">
              <h3 [class]="heading + ' text-[clamp(34px,4vw,52px)]'">
                {{ t.installments.title }}
              </h3>
              <p class="m-0 max-w-[480px] text-lg leading-normal sm:text-[19px]">
                {{ t.installments.body }}
              </p>
            </div>
          </article>

          <article [class]="questionCard + ' bg-savings-soft'">
            <div class="flex flex-[1_1_420px] flex-col gap-4">
              <h3 [class]="heading + ' text-[clamp(34px,4vw,52px)]'">{{ t.pockets.title }}</h3>
              <p class="m-0 max-w-[480px] text-lg leading-normal sm:text-[19px]">
                {{ t.pockets.body }}
              </p>
            </div>
            <ul class="m-0 flex flex-[1_1_300px] list-none flex-col gap-3 p-0">
              @for (pocket of t.pockets.rows; track pocket.label) {
                <li [class]="row + (pocket.highlight ? ' bg-savings' : ' bg-surface')">
                  <span>{{ pocket.label }}</span>
                  <span class="font-amount font-semibold">{{ pocket.amount }}</span>
                </li>
              }
            </ul>
          </article>

          <article [class]="questionCard + ' flex-wrap-reverse bg-pending-soft'">
            <ul class="m-0 flex flex-[1_1_300px] list-none flex-col gap-2.5 p-0">
              @for (item of t.fixed.rows; track item.label) {
                <li [class]="row + (item.kind === 'pending' ? ' bg-pending' : ' bg-surface')">
                  <span>{{ item.label }}</span>
                  <span
                    [class]="
                      item.kind === 'pending'
                        ? 'font-bold'
                        : item.kind === 'income'
                          ? 'font-amount font-semibold text-brand-strong'
                          : 'font-amount font-semibold'
                    "
                    >{{ item.value }}</span
                  >
                </li>
              }
            </ul>
            <div class="flex flex-[1_1_420px] flex-col gap-4">
              <h3 [class]="heading + ' text-[clamp(34px,4vw,52px)]'">{{ t.fixed.title }}</h3>
              <p class="m-0 max-w-[480px] text-lg leading-normal sm:text-[19px]">
                {{ t.fixed.body }}
              </p>
            </div>
          </article>
        </section>

        <section class="px-4 pb-24 pt-16 sm:px-6 sm:pb-30 sm:pt-20" aria-labelledby="cierre">
          <div
            class="mx-auto flex max-w-[1192px] flex-wrap items-center justify-between gap-10 rounded-[40px] bg-ink p-[clamp(32px,6vw,88px)] text-on-ink"
          >
            <div class="flex max-w-[640px] flex-col gap-5">
              <h2 id="cierre" [class]="heading + ' text-[clamp(40px,5vw,72px)]'">
                {{ t.closingTitle }}
              </h2>
              <p class="m-0 text-lg leading-normal opacity-80 sm:text-[19px]">
                {{ t.closingBody }}
              </p>
              <a
                routerLink="/registro"
                class="flex min-h-14 items-center self-start rounded-full bg-brand px-7 text-lg font-bold text-ink hover:bg-brand-soft"
                >{{ t.registerFree }}</a
              >
            </div>
            <pl-wink class="w-[140px] text-brand sm:w-[180px]" [animated]="true" />
          </div>
        </section>
      }
    </main>

    <footer
      class="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 px-4 pb-12 text-[15px] text-muted sm:px-6"
    >
      <span
        ><strong class="text-ink">{{ t.brand }}</strong
        >. {{ t.footerTagline }}</span
      >
      <a
        routerLink="/planes"
        class="-my-3 inline-flex min-h-11 items-center font-semibold text-ink hover:text-brand-strong"
        >{{ t.plans }}</a
      >
      <span>{{ t.footerMade }}</span>
    </footer>
  `,
})
export class LandingPage {
  protected readonly t = LANDING_TEXTS;
  /** Signed in: the nav takes you to the app instead of offering to sign in. */
  protected readonly hasSession = sessionHint();
  /** One wink per message of the bubble. */
  protected readonly winks = signal(0);
  protected readonly bars = INSTALLMENT_BARS;
  protected readonly heading = HEADING;
  protected readonly questionCard = QUESTION_CARD;
  protected readonly row = ROW;
}
