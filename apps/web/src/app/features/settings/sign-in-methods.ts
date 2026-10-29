import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LucideKeyRound } from '@lucide/angular';
import {
  AuthProvider,
  AUTH_PROVIDER_SLUGS,
  setPasswordRequestSchema,
  SignInMethodsResponse,
} from '@platin/contracts';
import { canRemoveSignInMethod } from '@platin/domain';
import { PlButton } from '@platin/web-ui';
import { API } from '../../core/api';
import { OAuthService, PROVIDER_NAMES } from '../../core/auth/oauth.service';
import { errorMessage, messageForCode } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { fieldError, zodValidator } from '../../core/forms/zod-validator';
import { SETTINGS_TEXTS } from './settings.texts';

interface ProviderRow {
  provider: AuthProvider;
  slug: string;
  identityId: string | null;
  email: string | null;
  /** Still offered to link (the server has it enabled). */
  enabled: boolean;
}

/** AUTH-07 and AUTH-08: password and providers, with link, unlink and "set a password". */
@Component({
  selector: 'pl-sign-in-methods',
  imports: [ReactiveFormsModule, FormField, PlButton, LucideKeyRound],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex flex-col gap-4 rounded-card bg-surface p-5"
      aria-labelledby="methods-title"
    >
      <h2 id="methods-title" class="text-lg font-bold">{{ texts.title }}</h2>

      @if (message()) {
        <p class="rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      @if (methods.hasValue()) {
        <ul class="flex flex-col divide-y divide-line-soft">
          <li class="flex min-h-14 items-center gap-3 py-2">
            <svg lucideKeyRound [size]="20" class="text-muted"></svg>
            <span class="flex-1">
              <span class="block font-medium">{{ texts.password }}</span>
              <span class="block text-sm text-muted">
                {{ hasPassword() ? texts.passwordSet : texts.passwordMissing }}
              </span>
            </span>
          </li>
          @for (row of rows(); track row.provider) {
            <li class="flex min-h-14 flex-wrap items-center gap-3 py-2">
              @if (row.provider === 'GOOGLE') {
                <img src="/brand/google-g.svg" alt="" width="20" height="20" class="size-5" />
              }
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{ names[row.provider] }}</span>
                <span class="block truncate text-sm text-muted">
                  {{ row.identityId ? (row.email ?? texts.linked) : texts.notLinked }}
                </span>
              </span>
              @if (row.identityId) {
                <button
                  plButton="secondary"
                  type="button"
                  [disabled]="!canUnlink() || busy()"
                  [attr.aria-describedby]="canUnlink() ? null : 'last-method-hint'"
                  (click)="unlink(row.identityId)"
                >
                  {{ texts.unlink }}
                </button>
              } @else if (row.enabled) {
                <button
                  plButton="secondary"
                  type="button"
                  [disabled]="busy()"
                  (click)="link(row.slug)"
                >
                  {{ texts.link }}
                </button>
              }
            </li>
          }
        </ul>
        @if (!canUnlink() && identityCount() > 0) {
          <p id="last-method-hint" class="text-sm text-muted">{{ texts.lastMethodHint }}</p>
        }

        @if (!hasPassword()) {
          <form
            class="flex flex-col gap-3 border-t border-line-soft pt-4"
            [formGroup]="form"
            (ngSubmit)="setPassword()"
            novalidate
          >
            <pl-form-field
              [label]="texts.newPassword"
              controlId="new-password"
              [error]="fieldError(form.controls.password)"
            >
              <input
                id="new-password"
                type="password"
                autocomplete="new-password"
                [class]="inputClass"
                formControlName="password"
                [attr.aria-invalid]="!!fieldError(form.controls.password)"
                aria-describedby="new-password-error new-password-hint"
              />
            </pl-form-field>
            <p id="new-password-hint" class="-mt-1 text-sm text-muted">{{ texts.passwordHint }}</p>
            <button plButton type="submit" [disabled]="busy()">{{ texts.setPassword }}</button>
          </form>
        }
      } @else if (methods.error()) {
        <p class="text-sm text-muted" role="alert">{{ texts.loadError }}</p>
      }
    </section>
  `,
})
export class SignInMethods {
  /** `?vinculado=google` after linking, `?error=CODE` if the link failed. */
  readonly linked = input<string>();
  readonly linkError = input<string>();

  protected readonly texts = SETTINGS_TEXTS.signInMethods;
  protected readonly names = PROVIDER_NAMES;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly fieldError = fieldError;

  private readonly oauth = inject(OAuthService);
  protected readonly methods = httpResource<SignInMethodsResponse>(() => `${API}/auth/identities`);

  protected readonly busy = signal(false);
  protected readonly error = linkedSignal<string | null>(() => messageForCode(this.linkError()));
  protected readonly message = linkedSignal<string | null>(() =>
    this.linked() ? this.texts.linkedOk : null,
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', zodValidator(setPasswordRequestSchema.shape.password)],
  });

  protected readonly hasPassword = computed(() =>
    this.methods.hasValue() ? this.methods.value().hasPassword : true,
  );
  protected readonly identityCount = computed(() =>
    this.methods.hasValue() ? this.methods.value().identities.length : 0,
  );
  protected readonly canUnlink = computed(() =>
    canRemoveSignInMethod({ hasPassword: this.hasPassword(), identities: this.identityCount() }),
  );

  /** Every enabled provider, plus linked ones the server no longer offers (to unlink them). */
  protected readonly rows = computed<ProviderRow[]>(() => {
    const identities = this.methods.hasValue() ? this.methods.value().identities : [];
    const enabled = this.oauth.providers.hasValue() ? this.oauth.providers.value().providers : [];
    const providers = new Set<AuthProvider>([
      ...enabled.map((p) => p.provider),
      ...identities.map((i) => i.provider),
    ]);
    return [...providers].map((provider) => {
      const identity = identities.find((i) => i.provider === provider);
      return {
        provider,
        slug: AUTH_PROVIDER_SLUGS[provider],
        identityId: identity?.id ?? null,
        email: identity?.email ?? null,
        enabled: enabled.some((p) => p.provider === provider),
      };
    });
  });

  protected async link(slug: string): Promise<void> {
    await this.run(() => this.oauth.link(slug), { keepBusy: true });
  }

  protected async unlink(identityId: string): Promise<void> {
    await this.run(async () => {
      await this.oauth.unlink(identityId);
      this.message.set(this.texts.unlinkedOk);
    });
  }

  protected async setPassword(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    await this.run(async () => {
      await this.oauth.setPassword(this.form.controls.password.value);
      this.form.reset();
      this.message.set(this.texts.passwordSaved);
    });
  }

  /** Runs a write and reloads the list. A link leaves the page, so it stays busy. */
  private async run(write: () => Promise<void>, options = { keepBusy: false }): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await write();
      this.methods.reload();
      if (!options.keepBusy) this.busy.set(false);
    } catch (error) {
      this.error.set(errorMessage(error));
      this.busy.set(false);
    }
  }
}
