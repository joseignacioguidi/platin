import { freePerDay, freeThisMonth } from './free';
import { Money } from './money';
import {
  finishedOnboardingState,
  fixedDayPassed,
  fixedStartPeriod,
  initialOnboardingState,
  isOnboardingUntouched,
  lastTouchedOnboardingStep,
  markOnboardingStep,
  missingOnboardingSteps,
  onboardingProgress,
} from './onboarding';
import { ars, d, p } from './test-helpers';

describe('fixedStartPeriod', () => {
  const today = d('2026-11-08');

  it('starts next month when the day already passed', () => {
    expect(fixedStartPeriod(1, today)).toBe(p('2026-12'));
    expect(fixedStartPeriod(7, today)).toBe(p('2026-12'));
  });

  it('starts this month on today or a later day', () => {
    expect(fixedStartPeriod(8, today)).toBe(p('2026-11'));
    expect(fixedStartPeriod(10, today)).toBe(p('2026-11'));
  });

  it('"Todavía no lo cobré" starts it this month', () => {
    expect(fixedStartPeriod(1, today, false)).toBe(p('2026-11'));
  });

  it('day 31 in a 30-day month is the last day', () => {
    expect(fixedDayPassed(31, d('2026-11-30'))).toBe(false);
    expect(fixedStartPeriod(31, d('2026-11-30'))).toBe(p('2026-11'));
    expect(fixedStartPeriod(31, d('2026-11-29'))).toBe(p('2026-11'));
  });

  it('on the last day of the month, earlier days start next month (and next year)', () => {
    expect(fixedStartPeriod(29, d('2026-11-30'))).toBe(p('2026-12'));
    expect(fixedStartPeriod(30, d('2026-12-31'))).toBe(p('2027-01'));
    expect(fixedStartPeriod(31, d('2026-12-31'))).toBe(p('2026-12'));
  });

  it('the example of the rule: $ 80.780 free, ≈ $ 3.512 per day until 30/11', () => {
    const fixed = [
      { kind: 'INCOME', amount: ars('1600000'), day: 1 }, // Sueldo: starts in December
      { kind: 'EXPENSE', amount: ars('380000'), day: 10 }, // Alquiler
      { kind: 'EXPENSE', amount: ars('3300'), day: 7 }, // Spotify on the Visa: December
    ] as const;
    const thisMonth = fixed.filter((f) => fixedStartPeriod(f.day, today) === p('2026-11'));
    const sum = (kind: 'INCOME' | 'EXPENSE') =>
      thisMonth
        .filter((f) => f.kind === kind)
        .reduce((total, f) => total.add(f.amount), Money.zero('ARS'));
    const inAccounts = ars('0').add(ars('459880')).add(ars('900'));
    const free = freeThisMonth({ inAccounts, toCollect: sum('INCOME'), toPay: sum('EXPENSE') });
    expect(inAccounts.toString()).toBe('460780.00');
    expect(free.toString()).toBe('80780.00');
    expect(freePerDay(free, today, p('2026-11'))?.toString()).toBe('3512.00');
  });
});

describe('onboarding state', () => {
  it('starts untouched, with nothing done', () => {
    const state = initialOnboardingState();
    expect(isOnboardingUntouched(state)).toBe(true);
    expect(onboardingProgress(state)).toBe(0);
    expect(lastTouchedOnboardingStep(state)).toBeNull();
  });

  it('counts done and skipped steps; "más tarde" is still missing', () => {
    let state = markOnboardingStep(initialOnboardingState(), 'accounts', 'DONE');
    state = markOnboardingStep(state, 'cards', 'DONE');
    state = markOnboardingStep(state, 'cardCharges', 'LATER');
    expect(onboardingProgress(state)).toBe(2);
    expect(missingOnboardingSteps(state)).toEqual(['cardCharges', 'fixed']);
    expect(isOnboardingUntouched(state)).toBe(false);
    expect(lastTouchedOnboardingStep(state)).toBe('cardCharges');
    expect(state.status).toBe('IN_PROGRESS');
  });

  it('is done when every step is done or skipped', () => {
    let state = initialOnboardingState();
    for (const step of ['accounts', 'cards', 'cardCharges', 'fixed'] as const) {
      state = markOnboardingStep(state, step, 'SKIPPED');
    }
    expect(state.status).toBe('DONE');
    expect(missingOnboardingSteps(state)).toEqual([]);
  });

  it('skipping the cards skips their charges, unless they were loaded', () => {
    const skipped = markOnboardingStep(initialOnboardingState(), 'cards', 'SKIPPED');
    expect(skipped.steps.cardCharges).toBe('SKIPPED');
    const loaded = markOnboardingStep(
      markOnboardingStep(initialOnboardingState(), 'cardCharges', 'DONE'),
      'cards',
      'SKIPPED',
    );
    expect(loaded.steps.cardCharges).toBe('DONE');
  });

  it('a finished onboarding stays finished', () => {
    const state = markOnboardingStep(finishedOnboardingState(), 'fixed', 'LATER');
    expect(state.status).toBe('DONE');
    expect(missingOnboardingSteps(state)).toEqual([]);
  });
});
