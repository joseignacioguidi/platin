import { httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LucideKeyRound, LucideLogOut } from '@lucide/angular';
import {
  AuthProvider,
  AUTH_PROVIDER_SLUGS,
  setPasswordRequestSchema,
  SignInMethodsResponse,
} from '@platin/contracts';
import { canRemoveSignInMethod } from '@platin/domain';
import { PlButton } from '@platin/web-ui';
import { Router } from '@angular/router';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { OAuthService, PROVIDER_NAMES } from '../../core/auth/oauth.service';
import { errorMessage, messageForCode } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { fieldError, zodValidator } from '../../core/forms/zod-validator';
import { PROFILE_GROUP } from './profile-group';
import { SETTINGS_TEXTS } from './settings.texts';

interface ProviderRow {
  provider: AuthProvider;
  slug: string;
  identityId: string | null;
  email: string | null;
  /** Still offered to link (the server has it enabled). */
  enabled: boolean;
}

/**
 * AUTH-07, AUTH-08 and AUTH-10 "Ingreso y seguridad": providers and password, each one in a row,
 * with link, unlink and "Definir" for a password; "Cerrar sesión" at the end.
 */
@Component({
  selector: 'pl-sign-in-methods',
  imports: [ReactiveFormsModule, FormField, PlButton, LucideKeyRound, LucideLogOut],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="group.section" aria-labelledby="methods-title">
      <h2 id="methods-title" [class]="group.title">{{ texts.title }}</h2>
      <div [class]="group.body + ' gap-0! py-1 lg:py-0'">
        @if (message()) {
          <p class="my-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">
            {{ message() }}
          </p>
        }
        @if (error()) {
          <p class="my-2 rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">
            {{ error() }}
          </p>
        }

        @if (methods.hasValue()) {
          <ul class="flex flex-col divide-y divide-line-soft">
            @for (row of rows(); track row.provider) {
              <li class="flex min-h-16 flex-wrap items-center gap-3 py-2">
                @if (row.provider === 'GOOGLE') {
                  <img src="/brand/google-g.svg" alt="" width="20" height="20" class="size-5" />
                }
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold">{{ names[row.provider] }}</span>
                  <span class="block truncate text-[13px] text-muted">{{
                    providerStatus(row)
                  }}</span>
                </span>
                @if (row.identityId) {
                  @if (canUnlink()) {
                    <button
                      plButton="secondary"
                      size="sm"
                      type="button"
                      [disabled]="busy()"
                      (click)="unlink(row.identityId)"
                    >
                      {{ texts.unlink }}
                    </button>
                  }
                } @else if (row.enabled) {
                  <button
                    plButton="secondary"
                    size="sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="link(row.slug)"
                  >
                    {{ texts.link }}
                  </button>
                }
              </li>
            }
            <li class="flex flex-col py-2">
              <div class="flex min-h-12 items-center gap-3">
                <svg lucideKeyRound [size]="20" class="text-muted" aria-hidden="true"></svg>
                <span class="flex-1">
                  <span class="block font-semibold">{{ texts.password }}</span>
                  <span class="block text-[13px] text-muted">
                    {{ hasPassword() ? texts.passwordSet : texts.passwordMissing }}
                  </span>
                </span>
                @if (!hasPassword() && !definingPassword()) {
                  <button
                    plButton="secondary"
                    size="sm"
                    type="button"
                    [attr.aria-expanded]="false"
                    (click)="definePassword()"
                  >
                    {{ texts.define }}
                  </button>
                }
              </div>
              <!-- AUTH-08: "Definir" opens the field under the row. -->
              @if (!hasPassword() && definingPassword()) {
                <form
                  class="flex flex-col gap-3 pt-3"
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
                      #passwordInput
                      id="new-password"
                      type="password"
                      autocomplete="new-password"
                      [class]="inputClass"
                      formControlName="password"
                      [attr.aria-invalid]="!!fieldError(form.controls.password)"
                      aria-describedby="new-password-error new-password-hint"
                    />
                  </pl-form-field>
                  <p id="new-password-hint" class="-mt-1 text-sm text-muted">
                    {{ texts.passwordHint }}
                  </p>
                  <button plButton type="submit" [disabled]="busy()">
                    {{ texts.setPassword }}
                  </button>
                </form>
              }
            </li>
          </ul>
          @if (!canUnlink() && identityCount() > 0) {
            <p class="pb-2 text-[13px] text-muted">{{ lastMethodHint() }}</p>
          }
        } @else if (methods.error()) {
          <p class="py-3 text-sm text-muted" role="alert">{{ texts.loadError }}</p>
        }

        <button
          type="button"
          class="mt-1 flex min-h-12 items-center gap-2.5 border-t border-line-soft text-left font-semibold"
          (click)="logout()"
        >
          <svg lucideLogOut [size]="20" class="text-muted" aria-hidden="true"></svg>
          {{ profileTexts.logout }}
        </button>
      </div>
    </section>
  `,
})
export class SignInMethods {
  /** `?vinculado=google` after linking, `?error=CODE` if the link failed. */
  readonly linked = input<string>();
  readonly linkError = input<string>();

  protected readonly texts = SETTINGS_TEXTS.signInMethods;
  protected readonly profileTexts = SETTINGS_TEXTS.profile;
  protected readonly group = PROFILE_GROUP;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly definingPassword = signal(false);
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
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

  /** "joseignacioguidi@gmail.com · tu única forma de ingresar". */
  protected providerStatus(row: ProviderRow): string {
    if (!row.identityId) return this.texts.notLinked;
    const who = row.email ?? this.texts.linked;
    return this.canUnlink() ? who : `${who} · ${this.texts.onlyMethod}`;
  }

  protected readonly lastMethodHint = computed(() => {
    const identities = this.methods.hasValue() ? this.methods.value().identities : [];
    return this.texts.lastMethodHint(identities[0] ? this.names[identities[0].provider] : '');
  });

  protected definePassword(): void {
    this.definingPassword.set(true);
    afterNextRender(() => this.passwordInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.router.navigateByUrl('/ingresar');
  }

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
