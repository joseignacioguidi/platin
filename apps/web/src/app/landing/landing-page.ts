import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlButton } from '@platin/web-ui';
import { LANDING_TEXTS } from './landing.texts';

/** Public landing (prerendered). Minimal until phase 8. */
@Component({
  selector: 'pl-landing-page',
  imports: [RouterLink, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-canvas text-ink' },
  template: `
    <main class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-12">
      <div class="flex items-center gap-4">
        <img src="favicon.svg" alt="" width="64" height="64" class="rounded-2xl" />
        <h1 class="text-4xl font-bold">{{ texts.title }}</h1>
      </div>
      <div class="flex flex-col gap-3">
        <p class="text-3xl font-bold leading-tight">{{ texts.tagline }}</p>
        <p class="text-lg text-muted">{{ texts.pitch }}</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <a plButton routerLink="/registro">{{ texts.register }}</a>
        <a plButton="secondary" routerLink="/ingresar">{{ texts.login }}</a>
      </div>
    </main>
  `,
})
export class LandingPage {
  protected readonly texts = LANDING_TEXTS;
}
