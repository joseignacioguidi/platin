import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { emailSchema, registerRequestSchema } from '@platin/contracts';
import { PlButton } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { fieldError, zodValidator } from '../../core/forms/zod-validator';
import { ServerWake } from '../../core/session/server-wake.service';
import { SessionService } from '../../core/session/session.service';
import { AuthLayout } from './auth-layout';
import { AUTH_TEXTS } from './auth.texts';
import { ProviderButtons } from './provider-buttons';

@Component({
  selector: 'pl-register-page',
  imports: [AuthLayout, ReactiveFormsModule, FormField, PlButton, RouterLink, ProviderButtons],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-auth-layout [heading]="texts.register.title">
      <pl-provider-buttons />
      <form class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <pl-form-field [label]="texts.name" controlId="name">
          <input
            id="name"
            type="text"
            autocomplete="given-name"
            [class]="inputClass"
            formControlName="name"
          />
        </pl-form-field>
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
          [hint]="texts.passwordHint"
          [error]="fieldError(form.controls.password)"
        >
          <input
            id="password"
            type="password"
            autocomplete="new-password"
            [class]="inputClass"
            formControlName="password"
            [attr.aria-invalid]="!!fieldError(form.controls.password)"
            aria-describedby="password-hint password-error"
          />
        </pl-form-field>

        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        @if (submitting() && wake.status() === 'waking') {
          <p class="text-sm text-muted" role="status">{{ texts.slowServer }}</p>
        }

        <button plButton size="lg" type="submit" [disabled]="submitting()">
          {{ submitting() ? texts.register.submitting : texts.register.submit }}
        </button>
      </form>
      <p footer class="text-center text-[15px] text-muted">
        {{ texts.register.hasAccount }}
        <a
          routerLink="/ingresar"
          class="font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          {{ texts.register.toLogin }}
        </a>
      </p>
    </pl-auth-layout>
  `,
})
export class RegisterPage {
  protected readonly texts = AUTH_TEXTS;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly fieldError = fieldError;
  protected readonly wake = inject(ServerWake);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [''],
    email: ['', zodValidator(emailSchema)],
    password: ['', zodValidator(registerRequestSchema.shape.password)],
  });

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) afterNextRender(() => void this.wake.wake());
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const { name, ...rest } = this.form.getRawValue();
      await this.wake.wake();
      await this.auth.register(
        registerRequestSchema.parse({ ...rest, name: name.trim() || undefined }),
      );
      await this.session.started();
      await this.router.navigateByUrl('/app/bienvenida');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
