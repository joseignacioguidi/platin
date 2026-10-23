import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { PALETTE_TEXTS } from './palette-page.texts';

interface Swatch {
  name: string;
  className: string;
}

/** Temporary page (phase 0): shows the platin palette and fonts. Replaced by the landing in phase 8. */
@Component({
  selector: 'pl-palette-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.dark]': 'dark()', class: 'block min-h-dvh bg-canvas text-ink' },
  template: `
    <main class="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <img src="favicon.svg" alt="" width="48" height="48" class="rounded-xl" />
          <div>
            <h1 class="text-3xl font-bold">{{ texts.title }}</h1>
            <p class="text-muted">{{ texts.tagline }}</p>
          </div>
        </div>
        <button
          type="button"
          class="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium"
          (click)="dark.set(!dark())"
        >
          {{ dark() ? texts.toggleLight : texts.toggleDark }}
        </button>
      </header>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-bold">{{ texts.colorsHeading }}</h2>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          @for (swatch of swatches; track swatch.name) {
            <li class="overflow-hidden rounded-tile border border-line-soft bg-surface">
              <div class="h-16" [class]="swatch.className"></div>
              <p class="font-amount px-3 py-2 text-sm">{{ swatch.name }}</p>
            </li>
          }
        </ul>
      </section>

      <section class="flex flex-col gap-3 rounded-card bg-surface p-5">
        <h2 class="text-lg font-bold">{{ texts.fontsHeading }}</h2>
        <p class="text-xl">{{ texts.sansSample }}</p>
        <p class="font-amount text-2xl font-semibold break-words sm:text-3xl">
          {{ texts.monoSample }}
        </p>
      </section>
    </main>
  `,
})
export class PalettePage {
  protected readonly texts = PALETTE_TEXTS;
  protected readonly dark = signal(false);
  protected readonly swatches: Swatch[] = [
    { name: 'brand', className: 'bg-brand' },
    { name: 'brand-strong', className: 'bg-brand-strong' },
    { name: 'ink', className: 'bg-ink' },
    { name: 'muted', className: 'bg-muted' },
    { name: 'expense', className: 'bg-expense' },
    { name: 'pending', className: 'bg-pending' },
    { name: 'transfer', className: 'bg-transfer' },
    { name: 'card', className: 'bg-card' },
    { name: 'savings', className: 'bg-savings' },
    { name: 'canvas', className: 'bg-canvas' },
    { name: 'surface', className: 'bg-surface' },
    { name: 'line', className: 'bg-line' },
  ];
}
