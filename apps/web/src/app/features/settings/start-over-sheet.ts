import { httpResource } from '@angular/common/http';
import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { SignInMethodsResponse } from '@platin/contracts';
import { PlButton, PlSheet } from '@platin/web-ui';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { INPUT_CLASS } from '../../core/forms/form-field';
import { SETTINGS_TEXTS } from './settings.texts';
import { StartOver } from './start-over.service';
import { OnboardingStore } from '../onboarding/onboarding.store';

/**
 * AUTH-09: shows what will be deleted and what stays, and asks for the email (and the password
 * when the account has one) before wiping the financial data.
 */
@Component({
  selector: 'pl-start-over-sheet',
  imports: [PlSheet, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="texts.title">
      <p class="text-[15px] text-muted">{{ texts.intro }}</p>

      @if (summary.hasValue()) {
        <ul class="flex flex-col gap-1 text-[15px]" [attr.aria-label]="texts.deletesLabel">
          @for (row of rows(); track row.label) {
            <li class="flex justify-between gap-3">
              <span>{{ row.label }}</span>
              <span class="font-amount">{{ row.count }}</span>
            </li>
          }
        </ul>
      } @else if (summary.error()) {
        <p class="text-sm text-muted" role="alert">{{ texts.summaryError }}</p>
      }

      <div class="flex flex-col gap-1">
        <p class="text-sm font-medium">{{ texts.keepsLabel }}</p>
        <ul class="list-disc pl-5 text-sm text-muted">
          @for (item of texts.keeps; track item) {
            <li>{{ item }}</li>
          }
        </ul>
      </div>

      <label class="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          class="size-5 accent-brand"
          [checked]="keepCategories()"
          (change)="keepCategories.set(checked($event))"
        />
        <span class="font-medium">{{ texts.keepCategories }}</span>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ texts.emailLabel(email()) }}</span>
        <input
          type="email"
          autocomplete="off"
          [class]="inputClass"
          [value]="typedEmail()"
          (input)="typedEmail.set(value($event))"
        />
      </label>
      @if (hasPassword()) {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{ texts.passwordLabel }}</span>
          <input
            type="password"
            autocomplete="current-password"
            [class]="inputClass"
            [value]="password()"
            (input)="password.set(value($event))"
          />
        </label>
      }

      <p class="text-sm font-medium text-expense">{{ texts.irreversible }}</p>
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button
        plButton
        size="lg"
        type="button"
        class="!bg-expense"
        [disabled]="!canConfirm()"
        (click)="confirm()"
      >
        {{ working() ? texts.working : texts.confirm(movements()) }}
      </button>
    </pl-sheet>
  `,
})
export class StartOverSheet {
  protected readonly texts = SETTINGS_TEXTS.startOver;
  protected readonly inputClass = INPUT_CLASS;
  private readonly startOver = inject(StartOver);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingStore);
  private readonly ref = inject(DialogRef);

  protected readonly summary = resource({ loader: () => this.startOver.summary() });
  private readonly methods = httpResource<SignInMethodsResponse>(() => `${API}/auth/identities`);

  protected readonly email = computed(() => this.auth.user()?.email ?? '');
  protected readonly keepCategories = signal(true);
  protected readonly typedEmail = signal('');
  protected readonly password = signal('');
  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly hasPassword = computed(() =>
    this.methods.hasValue() ? this.methods.value().hasPassword : false,
  );
  protected readonly movements = computed(() =>
    this.summary.hasValue() ? this.summary.value().transactions : 0,
  );
  protected readonly rows = computed(() => {
    if (!this.summary.hasValue()) return [];
    const s = this.summary.value();
    const counts = [
      s.accounts,
      s.pockets,
      s.transactions,
      s.transfers,
      s.cards,
      s.cardCharges,
      s.fixed,
      s.goals,
      s.valuations,
    ];
    return this.texts.rows.map((label, i) => ({ label, count: counts[i] }));
  });
  protected readonly canConfirm = computed(
    () =>
      !this.working() &&
      this.methods.hasValue() &&
      this.email() !== '' &&
      this.typedEmail().trim().toLowerCase() === this.email().toLowerCase() &&
      (!this.hasPassword() || this.password() !== ''),
  );

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected async confirm(): Promise<void> {
    this.working.set(true);
    this.error.set(null);
    try {
      await this.startOver.reset({
        confirmEmail: this.typedEmail().trim(),
        password: this.hasPassword() ? this.password() : undefined,
        keepCategories: this.keepCategories(),
      });
      this.ref.close();
      // The onboarding opens again from step 1 (ADR 0035).
      await this.onboarding.reload().catch(() => undefined);
      await this.router.navigateByUrl('/app/bienvenida/cuentas');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.working.set(false);
    }
  }
}
