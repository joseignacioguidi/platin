import { inject, Injectable } from '@angular/core';
import { PlBottomSheet } from '@platin/web-ui';
import { QUICK_ENTRY_TEXTS } from './quick-entry.texts';

/** Opens the quick entry sheet (from the + button or Ctrl+K). */
@Injectable({ providedIn: 'root' })
export class QuickEntryLauncher {
  private readonly sheet = inject(PlBottomSheet);
  private open$: Promise<unknown> | null = null;

  open(): void {
    if (this.open$) return;
    this.open$ = import('./quick-entry-sheet')
      .then(({ QuickEntrySheet }) => {
        const ref = this.sheet.open(QuickEntrySheet, { ariaLabel: QUICK_ENTRY_TEXTS.title });
        return new Promise((resolve) => ref.closed.subscribe(resolve));
      })
      .finally(() => (this.open$ = null));
  }
}
