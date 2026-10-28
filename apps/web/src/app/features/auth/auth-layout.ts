import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlWink } from '@platin/web-ui';
import { AUTH_TEXTS } from './auth.texts';

/** Shared frame of /ingresar and /registro. */
@Component({
  selector: 'pl-auth-layout',
  imports: [RouterLink, PlWink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh items-center justify-center bg-canvas px-5 py-10 text-ink' },
  template: `
    <main class="flex w-full max-w-sm flex-col gap-6">
      <a routerLink="/" class="flex items-center gap-3 self-start">
        <pl-wink class="w-9" />
        <span>
          <span class="block text-2xl font-bold leading-tight tracking-[-0.05em]">platin</span>
          <span class="block text-sm text-muted">{{ texts.tagline }}</span>
        </span>
      </a>
      <section class="flex flex-col gap-5 rounded-card border-2 border-ink bg-surface p-6">
        <h1 class="text-3xl font-bold leading-none tracking-[-0.04em]">{{ heading() }}</h1>
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
