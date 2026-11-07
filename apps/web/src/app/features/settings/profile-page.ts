import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { PlBottomSheet, PlButton } from '@platin/web-ui';
import { PlanSummary } from '../plans/plan-summary';
import { CurrenciesSettings } from './currencies-settings';
import { PersonalizationCard } from './personalization-card';
import { ProfileHeader } from './profile-header';
import { SETTINGS_TEXTS } from './settings.texts';
import { SignInMethods } from './sign-in-methods';
import { StartOverSheet } from './start-over-sheet';
import { TelegramSettings } from './telegram-settings';

/**
 * Perfil y ajustes (AUTH-10). From `lg`, the name across the top and two columns below: what you
 * use to work on the left, your platin account on the right. On a phone, one column in another
 * order (the wrappers turn into `contents` and each group takes its `order`).
 */
@Component({
  selector: 'pl-profile-page',
  imports: [
    PlButton,
    ProfileHeader,
    CurrenciesSettings,
    PersonalizationCard,
    TelegramSettings,
    PlanSummary,
    SignInMethods,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2.5 lg:gap-5' },
  template: `
    <h1 class="mx-1 text-2xl font-extrabold lg:mx-0 lg:text-3xl">{{ texts.title }}</h1>
    <pl-profile-header />

    <!-- As in the mockup, the columns wrap below ~880 px of content (at 1024 px they stack). -->
    <div class="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-start lg:gap-5">
      <div class="contents lg:flex lg:min-w-0 lg:flex-[3_1_520px] lg:flex-col lg:gap-5">
        <pl-currencies-settings class="order-1 lg:order-none" />
        <pl-personalization-card class="order-2 lg:order-none" />
        <pl-telegram-settings class="order-4 block lg:order-none" />
      </div>
      <div class="contents lg:flex lg:min-w-0 lg:flex-[2_1_340px] lg:flex-col lg:gap-5">
        <pl-plan-summary class="order-5 mt-4 lg:order-none lg:mt-0" />
        <pl-sign-in-methods
          class="order-3 block lg:order-none"
          [linked]="vinculado()"
          [linkError]="error()"
        />
        <section
          class="order-6 mt-6 flex flex-col gap-2.5 rounded-card border border-expense bg-surface p-4 lg:order-none lg:mt-0 lg:px-6 lg:py-5"
          aria-labelledby="danger-title"
        >
          <h2 id="danger-title" class="text-lg font-extrabold text-expense-ink">
            {{ danger.dangerTitle }}
          </h2>
          <p class="text-sm text-muted">{{ danger.dangerBody }}</p>
          <button
            plButton="danger"
            size="sm"
            type="button"
            class="font-bold text-expense-ink! sm:self-start"
            (click)="startOver()"
          >
            {{ danger.open }}
          </button>
        </section>
      </div>
    </div>
  `,
})
export class ProfilePage {
  /** Set by the API after linking a provider (AUTH-07): `?vinculado=google` or `?error=CODE`. */
  readonly vinculado = input<string>();
  readonly error = input<string>();

  protected readonly texts = SETTINGS_TEXTS.profile;
  protected readonly danger = SETTINGS_TEXTS.startOver;
  private readonly sheet = inject(PlBottomSheet);

  protected startOver(): void {
    this.sheet.open(StartOverSheet, { ariaLabel: this.danger.title });
  }
}
