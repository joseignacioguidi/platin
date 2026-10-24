import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ServerWake } from './server-wake.service';

/** Things that run once the user is in, after the refresh (sync in phase 5). */
export type SessionStartHook = () => Promise<void>;

/**
 * Restores the session when the app opens: wake the server, then refresh with the cookie.
 * Runs once; later navigations reuse the result.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(AuthService);
  private readonly wake = inject(ServerWake);
  private restoring: Promise<boolean> | null = null;
  private readonly hooks: SessionStartHook[] = [];

  restore(): Promise<boolean> {
    if (this.auth.isAuthenticated()) return Promise.resolve(true);
    this.restoring ??= this.run().finally(() => (this.restoring = null));
    return this.restoring;
  }

  /** Registers work to do every time a session starts (restore, login or register). */
  onStart(hook: SessionStartHook): void {
    this.hooks.push(hook);
  }

  async started(): Promise<void> {
    await Promise.allSettled(this.hooks.map((hook) => hook()));
  }

  private async run(): Promise<boolean> {
    if (!(await this.wake.wake())) return false;
    const ok = await this.auth.refresh();
    if (ok) await this.started();
    return ok;
  }
}
