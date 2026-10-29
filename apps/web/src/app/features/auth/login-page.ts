import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { emailSchema, loginRequestSchema } from '@platin/contracts';
import { PlButton } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage, messageForCode } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { fieldError, zodValidator } from '../../core/forms/zod-validator';
import { ServerWake } from '../../core/session/server-wake.service';
import { SessionService } from '../../core/session/session.service';
import { AuthLayout } from './auth-layout';
import { AUTH_TEXTS } from './auth.texts';
import { ProviderButtons } from './provider-buttons';

@Component({
  selector: 'pl-login-page',
  imports: [AuthLayout, ReactiveFormsModule, FormField, PlButton, RouterLink, ProviderButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-auth-layout [heading]="texts.login.title">
      <pl-provider-buttons [returnTo]="returnTo()" />
      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <pl-form-field
          [label]="texts.email"
          controlId="email"
          [error]="fieldError(form.controls.email)"
        >
          <input
            id="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            [class]="inputClass"
            formControlName="email"
            [attr.aria-invalid]="!!fieldError(form.controls.email)"
            aria-describedby="email-error"
          />
        </pl-form-field>
        <pl-form-field
          [label]="texts.password"
          controlId="password"
          [error]="fieldError(form.controls.password)"
        >
          <input
            id="password"
            type="password"
            autocomplete="current-password"
            [class]="inputClass"
            formControlName="password"
            [attr.aria-invalid]="!!fieldError(form.controls.password)"
            aria-describedby="password-error"
          />
        </pl-form-field>

        @if (alert()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ alert() }}</p>
        }
        @if (submitting() && wake.status() === 'waking') {
          <p class="text-sm text-muted" role="status">{{ texts.slowServer }}</p>
        }

        <button plButton size="lg" type="submit" [disabled]="submitting()">
          {{ submitting() ? texts.login.submitting : texts.login.submit }}
        </button>
      </form>
      <p footer class="text-center text-[15px] text-muted">
        {{ texts.login.noAccount }}
        <a
          routerLink="/registro"
          class="font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          {{ texts.login.toRegister }}
        </a>
      </p>
    </pl-auth-layout>
  `,
})
export class LoginPage {
  /** Where to go after logging in (`?volver=/app/tarjetas`). */
  readonly volver = input<string>();
  /** Code of a failed sign-in with a provider (`?error=ACCOUNT_EXISTS_LINK_REQUIRED`). */
  readonly error = input<string>();

  protected readonly texts = AUTH_TEXTS;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly fieldError = fieldError;
  protected readonly wake = inject(ServerWake);
  protected readonly submitting = signal(false);
  protected readonly alert = linkedSignal(() => messageForCode(this.error()));
  protected readonly returnTo = computed(() => safeReturnUrl(this.volver()));

  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', zodValidator(emailSchema)],
    password: ['', zodValidator(loginRequestSchema.shape.password)],
  });

  constructor() {
    // Start waking the server while the user types.
    if (isPlatformBrowser(inject(PLATFORM_ID))) afterNextRender(() => void this.wake.wake());
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.alert.set(null);
    try {
      await this.wake.wake();
      await this.auth.login(loginRequestSchema.parse(this.form.getRawValue()));
      await this.session.started();
      await this.router.navigateByUrl(this.returnTo());
    } catch (error) {
      this.alert.set(errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}

/** Only allows returning to a path inside the app (no open redirects). */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/app') && !url.startsWith('//') ? url : '/app';
}
