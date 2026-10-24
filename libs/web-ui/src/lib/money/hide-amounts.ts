import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

const STORAGE_KEY = 'platin.hideAmounts';

/** "Ocultar montos": global switch used by every pl-money, persisted in localStorage. */
@Injectable({ providedIn: 'root' })
export class HideAmounts {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly hidden = signal(this.read());

  constructor() {
    effect(() => {
      if (this.browser) localStorage.setItem(STORAGE_KEY, String(this.hidden()));
    });
  }

  toggle(): void {
    this.hidden.update((value) => !value);
  }

  private read(): boolean {
    return this.browser && localStorage.getItem(STORAGE_KEY) === 'true';
  }
}
