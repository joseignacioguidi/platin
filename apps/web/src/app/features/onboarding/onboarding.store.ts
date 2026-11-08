import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  Onboarding,
  OnboardingStepName,
  UpdateOnboardingStepRequest,
} from '@platin/contracts';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { RefreshBus, reloadOn } from '../../core/data/refresh-bus';
import { SessionService } from '../../core/session/session.service';

/**
 * The onboarding state (AUTH-05, AUTH-11). Kept per user: a different session loads it again.
 * The guard of /app needs it before the first page, so it is a promise, not an httpResource.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly bus = inject(RefreshBus);

  private readonly current = signal<{ userId: string; value: Onboarding } | null>(null);
  private loading: Promise<Onboarding> | null = null;

  /** The state of the signed-in user, once loaded. */
  readonly state = computed(() => {
    const current = this.current();
    return current && current.userId === this.auth.user()?.id ? current.value : null;
  });

  /** AUTH-11: the home card shows while steps are missing and "Ahora no" wasn't chosen. */
  readonly showsResumeCard = computed(() => {
    const state = this.state();
    return !!state && state.missing.length > 0 && !state.dismissedAt;
  });

  constructor() {
    reloadOn(this.bus, ['onboarding'], () => void this.reload());
    // A new sign-in clears "Ahora no" on the server: forget what was loaded before.
    inject(SessionService).onStart(async () => this.current.set(null));
  }

  /** The state, loading it the first time (or for another user). */
  ensure(): Promise<Onboarding> {
    const state = this.state();
    if (state) return Promise.resolve(state);
    return this.reload();
  }

  reload(): Promise<Onboarding> {
    this.loading ??= firstValueFrom(this.http.get<Onboarding>(`${API}/onboarding`))
      .then((value) => this.keep(value))
      .finally(() => (this.loading = null));
    return this.loading;
  }

  async mark(step: OnboardingStepName, status: UpdateOnboardingStepRequest['status']) {
    const body: UpdateOnboardingStepRequest = { status };
    return this.keep(
      await firstValueFrom(this.http.patch<Onboarding>(`${API}/onboarding/steps/${step}`, body)),
    );
  }

  async dismiss(): Promise<Onboarding> {
    return this.keep(
      await firstValueFrom(this.http.post<Onboarding>(`${API}/onboarding/dismiss`, null)),
    );
  }

  private keep(value: Onboarding): Onboarding {
    const userId = this.auth.user()?.id;
    if (userId) this.current.set({ userId, value });
    return value;
  }
}
