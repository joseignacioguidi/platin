import { addMonths, dateParts, dayInPeriod, LocalDate, Period, periodOf } from './dates';

/** Onboarding steps in the order they are shown (AUTH-05); `cardCharges` lives inside step 2. */
export const ONBOARDING_STEPS = ['accounts', 'cards', 'cardCharges', 'fixed'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** LATER = "Más tarde": still to do, the home card reminds it (AUTH-11). */
export const ONBOARDING_STEP_STATUSES = ['PENDING', 'DONE', 'SKIPPED', 'LATER'] as const;
export type OnboardingStepStatus = (typeof ONBOARDING_STEP_STATUSES)[number];

export interface OnboardingState {
  status: 'IN_PROGRESS' | 'DONE';
  steps: Record<OnboardingStep, OnboardingStepStatus>;
  /** "Ahora no" on the home card; cleared on the next sign-in. */
  dismissedAt?: string | null;
}

/** What a new user (or one who started over) gets. */
export function initialOnboardingState(): OnboardingState {
  return {
    status: 'IN_PROGRESS',
    steps: { accounts: 'PENDING', cards: 'PENDING', cardCharges: 'PENDING', fixed: 'PENDING' },
    dismissedAt: null,
  };
}

/** Accounts from before iteration 13 have no state: they count as done and never see it. */
export function finishedOnboardingState(): OnboardingState {
  return {
    status: 'DONE',
    steps: { accounts: 'DONE', cards: 'DONE', cardCharges: 'DONE', fixed: 'DONE' },
    dismissedAt: null,
  };
}

const isClosed = (status: OnboardingStepStatus) => status === 'DONE' || status === 'SKIPPED';

/**
 * Marks a step. Without a card there are no charges to load, so skipping the cards skips the
 * charges too (unless they were already loaded). The onboarding is done once every step is done
 * or skipped; a step marked again later reopens nothing.
 */
export function markOnboardingStep(
  state: OnboardingState,
  step: OnboardingStep,
  status: OnboardingStepStatus,
): OnboardingState {
  const steps = { ...state.steps, [step]: status };
  if (step === 'cards' && status === 'SKIPPED' && steps.cardCharges !== 'DONE') {
    steps.cardCharges = 'SKIPPED';
  }
  const done = state.status === 'DONE' || ONBOARDING_STEPS.every((s) => isClosed(steps[s]));
  return { ...state, steps, status: done ? 'DONE' : 'IN_PROGRESS' };
}

/** "N de 4" on the home card: steps done or skipped. */
export function onboardingProgress(state: OnboardingState): number {
  return ONBOARDING_STEPS.filter((step) => isClosed(state.steps[step])).length;
}

/** Steps still to do (pending or "más tarde"), in order. */
export function missingOnboardingSteps(state: OnboardingState): OnboardingStep[] {
  if (state.status === 'DONE') return [];
  return ONBOARDING_STEPS.filter((step) => !isClosed(state.steps[step]));
}

/** No step touched yet: entering /app leads to step 1. */
export function isOnboardingUntouched(state: OnboardingState): boolean {
  return (
    state.status === 'IN_PROGRESS' &&
    ONBOARDING_STEPS.every((step) => state.steps[step] === 'PENDING')
  );
}

/** Last step touched (for the admin metrics), or null if none. */
export function lastTouchedOnboardingStep(state: OnboardingState): OnboardingStep | null {
  const touched = ONBOARDING_STEPS.filter((step) => state.steps[step] !== 'PENDING');
  return touched.at(-1) ?? null;
}

/** Whether the day of a monthly item already passed this month (day clamped to the month). */
export function fixedDayPassed(dayOfMonth: number, today: LocalDate): boolean {
  const due = dayInPeriod(periodOf(today), dayOfMonth);
  return dateParts(due).day < dateParts(today).day;
}

/**
 * First period of a fixed item loaded in the onboarding (rule "Onboarding"): if its day already
 * passed this month, that money is already in (or out of) today's balance, so it starts next
 * month. `alreadyHappened = false` ("Todavía no lo cobré") makes it start this month, with its
 * pending movement to confirm. A day from today on starts this month.
 */
export function fixedStartPeriod(
  dayOfMonth: number,
  today: LocalDate,
  alreadyHappened = true,
): Period {
  const current = periodOf(today);
  return fixedDayPassed(dayOfMonth, today) && alreadyHappened ? addMonths(current, 1) : current;
}
