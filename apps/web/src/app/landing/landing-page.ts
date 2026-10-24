import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlButton } from '@platin/web-ui';
import { LANDING_TEXTS } from './landing.texts';

type Shot = keyof typeof LANDING_TEXTS.shotAlt;

const SHOT_FILES: Record<Shot, string> = {
  inicio: 'landing/inicio.webp',
  carga: 'landing/carga-rapida.webp',
  tarjeta: 'landing/tarjeta.webp',
  meta: 'landing/meta.webp',
  ahorros: 'landing/ahorros.webp',
};

/** LAN-01: public landing, prerendered. Coral, sky and rose accents are used only here. */
@Component({
  selector: 'pl-landing-page',
  imports: [RouterLink, PlButton, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh overflow-x-hidden bg-canvas text-ink' },
  template: `
    <header class="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <a routerLink="/" class="flex items-center gap-3">
        <img src="favicon.svg" alt="" width="40" height="40" class="rounded-xl" />
        <span class="text-2xl font-bold">{{ t.brand }}</span>
      </a>
      <nav [attr.aria-label]="t.nav" class="flex items-center gap-2">
        <a plButton="ghost" size="sm" routerLink="/ingresar">{{ t.login }}</a>
        <a plButton size="sm" routerLink="/registro">{{ t.register }}</a>
      </nav>
    </header>

    <main>
      <section
        class="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pt-12"
      >
        <div
          class="pointer-events-none absolute -right-24 -top-10 size-80 rounded-full bg-rose opacity-60"
          aria-hidden="true"
        ></div>
        <div
          class="pointer-events-none absolute -bottom-16 left-1/3 size-56 rounded-full bg-sky opacity-50"
          aria-hidden="true"
        ></div>
        <div class="relative flex flex-col gap-6">
          <h1 class="text-5xl font-bold leading-[1.05] md:text-7xl">{{ t.tagline }}</h1>
          <p class="max-w-xl text-lg text-muted md:text-xl">{{ t.pitch }}</p>
          <div class="flex flex-wrap gap-3">
            <a plButton routerLink="/registro" class="min-h-14 px-7 text-[17px]">{{
              t.registerFree
            }}</a>
            <a plButton="secondary" routerLink="/ingresar" class="min-h-14 px-7 text-[17px]">{{
              t.login
            }}</a>
          </div>
        </div>
        <div class="relative flex justify-center">
          <div
            class="w-[280px] overflow-hidden rounded-[44px] border-[10px] border-ink bg-ink shadow-2xl md:w-[320px]"
          >
            <img
              [ngSrc]="files.inicio"
              width="390"
              height="844"
              priority
              class="block h-auto w-full"
              [alt]="t.shotAlt.inicio"
            />
          </div>
        </div>
      </section>

      <!-- Below the fold: prerendered, hydrated only when it scrolls into view. -->
      @defer (hydrate on viewport) {
        @for (section of t.sections; track section.id; let odd = $odd) {
          <section
            class="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-2"
            [attr.aria-labelledby]="section.id"
          >
            <div [class]="odd ? 'flex flex-col gap-4 md:order-2' : 'flex flex-col gap-4'">
              <span
                class="h-1.5 w-12 rounded-full"
                [class.bg-coral]="!odd"
                [class.bg-sky]="odd"
                aria-hidden="true"
              ></span>
              <h2 [id]="section.id" class="text-3xl font-bold md:text-4xl">{{ section.title }}</h2>
              <p class="max-w-lg text-lg text-muted">{{ section.body }}</p>
            </div>
            <div class="flex justify-center">
              <div
                class="w-[260px] overflow-hidden rounded-[40px] border-[9px] border-ink bg-ink shadow-xl"
              >
                <img
                  [ngSrc]="files[section.shot]"
                  width="390"
                  height="844"
                  class="block h-auto w-full"
                  [alt]="t.shotAlt[section.shot]"
                />
              </div>
            </div>
          </section>
        }

        <section
          class="mx-5 mb-16 flex flex-col items-center gap-5 rounded-[32px] bg-ink px-6 py-14 text-center text-on-ink md:mx-auto md:max-w-4xl"
        >
          <h2 class="text-4xl font-bold">{{ t.closingTitle }}</h2>
          <p class="max-w-md text-lg opacity-80">{{ t.closingBody }}</p>
          <a plButton="brand" routerLink="/registro" class="min-h-14 px-8 text-[17px]">{{
            t.registerFree
          }}</a>
        </section>
      }
    </main>

    <footer class="border-t border-line-soft py-8 text-center text-sm text-muted">
      {{ t.footer }}
    </footer>
  `,
})
export class LandingPage {
  protected readonly t = LANDING_TEXTS;
  protected readonly files = SHOT_FILES;
}
