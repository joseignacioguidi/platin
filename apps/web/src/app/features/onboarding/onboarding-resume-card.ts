import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OnboardingStepName } from '@platin/contracts';
import { CardsStore } from '../cards/cards.store';
import { joinList, ONBOARDING_TEXTS } from './onboarding.texts';
import { OnboardingStore } from './onboarding.store';
import { ONBOARDING_PATHS } from './onboarding-steps';

const STEP_PATH: Record<OnboardingStepName, string> = {
  accounts: ONBOARDING_PATHS.accounts,
  cards: ONBOARDING_PATHS.cards,
  cardCharges: ONBOARDING_PATHS.cards,
  fixed: ONBOARDING_PATHS.fixed,
};

/**
 * AUTH-11 (mockup "Inicio a medias"): on top of the home while onboarding steps are missing.
 * "Ahora no" hides it until the next sign-in.
 */
@Component({
  selector: 'pl-onboarding-resume-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.showsResumeCard() && store.state(); as state) {
      <section
        class="flex flex-col gap-3 rounded-tile border-[1.5px] border-ink bg-surface p-4"
        aria-labelledby="onboarding-resume-title"
      >
        <span class="flex items-baseline justify-between gap-3">
          <h2 id="onboarding-resume-title" class="text-base font-extrabold">{{ t.title }}</h2>
          <span class="font-amount text-sm text-muted">{{ t.progress(state.progress) }}</span>
        </span>
        <span class="flex gap-1.5" aria-hidden="true">
          @for (n of [1, 2, 3, 4]; track n) {
            <span
              class="h-1.5 flex-1 rounded-full"
              [class]="n <= state.progress ? 'bg-ink' : 'bg-line'"
            ></span>
          }
        </span>
        <p class="text-sm text-muted">{{ t.missing }}{{ missingText() }}. {{ t.why }}</p>
        <span class="flex items-center justify-between gap-3">
          <a
            [routerLink]="continuePath()"
            class="flex min-h-11 items-center text-[15px] font-bold text-brand-strong hover:underline"
            >{{ t.continue }}</a
          >
          <button
            type="button"
            class="min-h-11 rounded-full px-3 text-sm text-muted hover:bg-field"
            [disabled]="dismissing()"
            (click)="dismiss()"
          >
            {{ t.notNow }}
          </button>
        </span>
      </section>
    }
  `,
})
export class OnboardingResumeCard implements OnInit {
  protected readonly t = ONBOARDING_TEXTS.resume;
  protected readonly store = inject(OnboardingStore);
  private readonly cards = inject(CardsStore);
  protected readonly dismissing = signal(false);

  protected readonly continuePath = computed(() => {
    const first = this.store.state()?.missing[0];
    return first ? STEP_PATH[first] : ONBOARDING_PATHS.accounts;
  });

  /** "consumos de la Visa Santander y lo que pagás todos los meses". */
  protected readonly missingText = computed(() => {
    const missing = this.store.state()?.missing ?? [];
    const cards = this.cards.cards().filter((card) => !card.archived);
    const parts = missing.map((step) =>
      step === 'cardCharges'
        ? this.t.cardCharges(cards.length === 1 ? cards[0].name : null)
        : this.t[step],
    );
    return joinList(parts);
  });

  ngOnInit(): void {
    void this.store.ensure().catch(() => undefined);
  }

  protected async dismiss(): Promise<void> {
    this.dismissing.set(true);
    try {
      await this.store.dismiss();
    } catch {
      // It stays visible; the user can try again.
    } finally {
      this.dismissing.set(false);
    }
  }
}
