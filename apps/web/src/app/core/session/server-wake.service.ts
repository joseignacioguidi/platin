import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { HEALTH_URL } from '../api';

export type WakeStatus = 'idle' | 'checking' | 'waking' | 'ready' | 'failed';

/** After this long without an answer, show the "waking up the server" screen. */
export const WAKE_SCREEN_DELAY_MS = 1500;
const RETRY_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 120_000;

/**
 * The free Render server sleeps after 15 minutes and takes about a minute to boot.
 * Before anything else the app pings /health directly and, if it is slow, shows a wait screen.
 */
@Injectable({ providedIn: 'root' })
export class ServerWake {
  private readonly http = inject(HttpClient);
  private pending: Promise<boolean> | null = null;

  readonly status = signal<WakeStatus>('idle');

  /** Resolves true when the server answers, false if it never does. */
  wake(): Promise<boolean> {
    if (this.status() === 'ready') return Promise.resolve(true);
    this.pending ??= this.run().finally(() => (this.pending = null));
    return this.pending;
  }

  private async run(): Promise<boolean> {
    this.status.set('checking');
    const slow = setTimeout(() => this.status.set('waking'), WAKE_SCREEN_DELAY_MS);
    const deadline = Date.now() + GIVE_UP_AFTER_MS;
    try {
      while (Date.now() < deadline) {
        try {
          await firstValueFrom(this.http.get(HEALTH_URL).pipe(timeout(RETRY_EVERY_MS * 10)));
          this.status.set('ready');
          return true;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
        }
      }
      this.status.set('failed');
      return false;
    } finally {
      clearTimeout(slow);
    }
  }
}
