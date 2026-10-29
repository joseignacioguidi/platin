import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { OAuthService, PROVIDER_NAMES } from '../../core/auth/oauth.service';
import { AUTH_TEXTS } from './auth.texts';

/**
 * AUTH-06: one "Continuar con <proveedor>" button per provider the API enables, then an "o"
 * separator before the email form. Nothing renders when no provider is enabled.
 * The Google button follows its brand guidelines: official "G" logo on white (or the dark
 * variant), the grey stroke and the "Continuar con Google" text.
 */
@Component({
  selector: 'pl-provider-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (providers().length > 0) {
      <div class="flex flex-col gap-3">
        @for (provider of providers(); track provider.provider) {
          <button
            type="button"
            class="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-google-stroke bg-google-surface px-4 text-[15px] font-medium text-google-text transition-opacity hover:opacity-90 disabled:opacity-60"
            [disabled]="leaving()"
            (click)="go(provider.slug)"
          >
            @if (provider.provider === 'GOOGLE') {
              <img src="/brand/google-g.svg" alt="" width="20" height="20" class="size-5" />
            }
            {{ texts.continueWith }} {{ names[provider.provider] }}
          </button>
        }
      </div>
      <div class="flex items-center gap-3 text-sm text-muted" role="separator">
        <span class="h-px flex-1 bg-line"></span>
        {{ texts.or }}
        <span class="h-px flex-1 bg-line"></span>
      </div>
    }
  `,
  host: { class: 'flex flex-col gap-5 empty:hidden' },
})
export class ProviderButtons {
  /** Where to go after signing in (only paths inside the app; the API checks again). */
  readonly returnTo = input<string>('/app');

  protected readonly texts = AUTH_TEXTS.providers;
  protected readonly names = PROVIDER_NAMES;
  protected readonly leaving = signal(false);

  private readonly oauth = inject(OAuthService);
  protected readonly providers = computed(() =>
    this.oauth.providers.hasValue() ? this.oauth.providers.value().providers : [],
  );

  protected go(slug: string): void {
    this.leaving.set(true);
    this.oauth.signIn(slug, this.returnTo());
  }
}
