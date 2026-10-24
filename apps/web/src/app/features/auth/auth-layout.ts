import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AUTH_TEXTS } from './auth.texts';

/** Shared frame of /ingresar and /registro. */
@Component({
  selector: 'pl-auth-layout',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-center justify-center bg-canvas px-5 py-10 text-ink' },
  template: `
    <main class="flex w-full max-w-sm flex-col gap-6">
      <a routerLink="/" class="flex items-center gap-3 self-start">
        <img src="favicon.svg" alt="" width="44" height="44" class="rounded-xl" />
        <span>
          <span class="block text-2xl font-bold leading-tight">platin</span>
          <span class="block text-sm text-muted">{{ texts.tagline }}</span>
        </span>
      </a>
      <section class="flex flex-col gap-5 rounded-card bg-surface p-6">
        <h1 class="text-2xl font-bold">{{ heading() }}</h1>
        <ng-content />
      </section>
      <ng-content select="[footer]" />
    </main>
  `,
})
export class AuthLayout {
  readonly heading = input.required<string>();
  protected readonly texts = AUTH_TEXTS;
}
