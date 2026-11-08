import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { isOnboardingUntouched } from '@platin/domain';
import { SessionService } from '../../core/session/session.service';
import { OnboardingStore } from './onboarding.store';
import { ONBOARDING_PATHS } from './onboarding-steps';

/**
 * /app (AUTH-05): a new account that hasn't touched any step goes to step 1 instead of an empty
 * home. Runs after the session is restored; if the state can't be read, the app opens as usual.
 */
export const onboardingGuard: CanActivateFn = async () => {
  // inject() before the first await: the injection context ends there.
  const session = inject(SessionService);
  const store = inject(OnboardingStore);
  const router = inject(Router);
  if (!(await session.restore())) return true;
  try {
    const state = await store.ensure();
    return isOnboardingUntouched(state) ? router.parseUrl(ONBOARDING_PATHS.accounts) : true;
  } catch {
    return true;
  }
};

/** /app/bienvenida/:paso: the steps read the state and the plan limits as they open. */
export const onboardingReady: CanActivateFn = async () => {
  const session = inject(SessionService);
  const store = inject(OnboardingStore);
  if (await session.restore()) await store.ensure().catch(() => undefined);
  return true;
};
