import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit } from '@angular/core';
import { AccountsStep } from './accounts-step';
import { CardsStep } from './cards-step';
import { FixedStep } from './fixed-step';
import { FreeStep } from './free-step';
import { OnboardingStore } from './onboarding.store';
import { ONBOARDING_SCREENS, type OnboardingScreen } from './onboarding-steps';

/**
 * /app/bienvenida/:paso (AUTH-05): the four steps, outside the shell, full screen. Each step
 * saves what it creates at once with the usual stores.
 */
@Component({
  selector: 'pl-onboarding-page',
  imports: [AccountsStep, CardsStep, FixedStep, FreeStep],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-canvas text-ink' },
  template: `
    @switch (screen()) {
      @case ('cuentas') {
        <pl-onboarding-accounts />
      }
      @case ('tarjetas') {
        <pl-onboarding-cards />
      }
      @case ('fijos') {
        <pl-onboarding-fixed />
      }
      @case ('libre') {
        <pl-onboarding-free />
      }
    }
  `,
})
export class OnboardingPage implements OnInit {
  readonly paso = input<string>('cuentas');
  private readonly onboarding = inject(OnboardingStore);

  protected readonly screen = computed<OnboardingScreen>(() => {
    const paso = this.paso() as OnboardingScreen;
    return ONBOARDING_SCREENS.includes(paso) ? paso : 'cuentas';
  });

  ngOnInit(): void {
    // The steps read the plan limits and the state from here.
    void this.onboarding.ensure().catch(() => undefined);
  }
}
