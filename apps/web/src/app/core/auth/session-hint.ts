import { afterNextRender, signal, Signal } from '@angular/core';

const KEY = 'platin.hasSession';

/**
 * A hint (not a credential) that this browser has a session: the access token lives only in
 * memory and the refresh cookie is httpOnly, so public pages can't know otherwise without
 * waking the server. Set on sign-in and every refresh, cleared on logout or a failed refresh.
 */
export function rememberSession(active: boolean): void {
  try {
    if (active) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: public pages just show the sign-in buttons.
  }
}

/**
 * Whether the browser has a session, read after the first render so prerendered pages hydrate
 * with the same HTML they were built with. Injection context.
 */
export function sessionHint(): Signal<boolean> {
  const active = signal(false);
  afterNextRender(() => {
    try {
      active.set(localStorage.getItem(KEY) === '1');
    } catch {
      active.set(false);
    }
  });
  return active.asReadonly();
}
