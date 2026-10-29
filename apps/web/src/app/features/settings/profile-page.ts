import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideLogOut, LucideMoon } from '@lucide/angular';
import type { Currency, RateType } from '@platin/domain';
import { PlButton, PlSegmented, PlSegmentOption } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { ThemeService } from '../../core/theme/theme.service';
import { PlanSummary } from '../plans/plan-summary';
import { SETTINGS_TEXTS } from './settings.texts';

/** AUTH-04: name, base currency and preferred rate; the plan (PLN-03); appearance and logout. */
@Component({
  selector: 'pl-profile-page',
  imports: [
    ReactiveFormsModule,
    FormField,
    PlButton,
    PlSegmented,
    LucideLogOut,
    LucideMoon,
    PlanSummary,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-4 text-xl font-bold">{{ texts.title }}</h1>

    <form
      class="flex flex-col gap-5 rounded-card bg-surface p-5"
      [formGroup]="form"
      (ngSubmit)="save()"
    >
      <pl-form-field [label]="texts.email" controlId="email">
        <input
          id="email"
          type="email"
          [class]="inputClass"
          [value]="auth.user()?.email ?? ''"
          disabled
        />
      </pl-form-field>
      <pl-form-field [label]="texts.name" controlId="name">
        <input
          id="name"
          type="text"
          autocomplete="given-name"
          [class]="inputClass"
          formControlName="name"
        />
      </pl-form-field>

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium" id="base-currency-label">{{ texts.baseCurrency }}</span>
        <pl-segmented
          [label]="texts.baseCurrency"
          [options]="currencyOptions"
          [value]="baseCurrency()"
          (valueChange)="baseCurrency.set($event)"
        />
        <p class="text-sm text-muted">{{ texts.baseCurrencyHint }}</p>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-sm font-medium">{{ texts.valuationRate }}</span>
        <pl-segmented
          [label]="texts.valuationRate"
          [options]="rateOptions"
          [value]="valuationRate()"
          (valueChange)="valuationRate.set($event)"
        />
        <p class="text-sm text-muted">{{ texts.valuationHint }}</p>
      </div>

      @if (message()) {
        <p class="rounded-2xl bg-brand-soft px-4 py-3 text-sm" role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="submit" [disabled]="saving()">
        {{ saving() ? texts.saving : texts.save }}
      </button>
    </form>

    <pl-plan-summary class="mt-4" />

    <section class="mt-4 flex flex-col gap-1 rounded-card bg-surface p-3">
      <h2 class="sr-only">{{ texts.appearance }}</h2>
      <label class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-field">
        <svg lucideMoon [size]="20" class="text-muted"></svg>
        <span class="flex-1 font-medium">{{ texts.darkMode }}</span>
        <input
          type="checkbox"
          role="switch"
          class="size-5 accent-brand"
          [checked]="theme.theme() === 'dark'"
          (change)="theme.toggle()"
        />
      </label>
      <button
        type="button"
        class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-field"
        (click)="logout()"
      >
        <svg lucideLogOut [size]="20" class="text-muted"></svg>
        {{ texts.logout }}
      </button>
    </section>
  `,
})
export class ProfilePage {
  protected readonly texts = SETTINGS_TEXTS.profile;
  protected readonly inputClass = INPUT_CLASS;
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly currencyOptions: PlSegmentOption<Currency>[] = (['ARS', 'USD'] as const).map(
    (value) => ({ value, label: SETTINGS_TEXTS.currencies[value] }),
  );
  protected readonly rateOptions: PlSegmentOption<RateType>[] = (
    ['OFICIAL', 'MEP', 'BLUE'] as const
  ).map((value) => ({ value, label: SETTINGS_TEXTS.rates[value] }));

  protected readonly form = inject(NonNullableFormBuilder).group({ name: [''] });
  protected readonly baseCurrency = signal<Currency>('ARS');
  protected readonly valuationRate = signal<RateType>('MEP');
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) return;
      this.form.setValue({ name: user.name ?? '' });
      this.baseCurrency.set(user.baseCurrency);
      this.valuationRate.set(user.valuationRate);
    });
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      const name = this.form.controls.name.value.trim();
      await this.auth.updateProfile({
        name: name || null,
        baseCurrency: this.baseCurrency(),
        valuationRate: this.valuationRate(),
      });
      this.message.set(this.texts.saved);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.router.navigateByUrl('/ingresar');
  }
}
