import { effect, Injectable, signal, Signal, untracked, WritableSignal } from '@angular/core';

/** Groups of server data that a write can make stale. */
export type DataKey =
  | 'accounts'
  | 'categories'
  | 'movements'
  | 'cards'
  | 'fixed'
  | 'commitments'
  | 'dashboard'
  | 'goals';

/**
 * After each write, the feature calls `invalidate(...)` with what it affected; stores that
 * read those keys reload. Keeps "invalidate what changed" in one place.
 */
@Injectable({ providedIn: 'root' })
export class RefreshBus {
  private readonly versions = new Map<DataKey, WritableSignal<number>>();

  version(key: DataKey): Signal<number> {
    return this.signalFor(key);
  }

  invalidate(...keys: DataKey[]): void {
    for (const key of keys) this.signalFor(key).update((v) => v + 1);
  }

  private signalFor(key: DataKey): WritableSignal<number> {
    let version = this.versions.get(key);
    if (!version) {
      version = signal(0);
      this.versions.set(key, version);
    }
    return version;
  }
}

/** Calls `reload` every time one of the keys is invalidated (not on creation). Injection context. */
export function reloadOn(bus: RefreshBus, keys: DataKey[], reload: () => void): void {
  let first = true;
  effect(() => {
    for (const key of keys) bus.version(key)();
    if (first) {
      first = false;
      return;
    }
    untracked(reload);
  });
}
