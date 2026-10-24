import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlButton, PlSheet } from '@platin/web-ui';
import { QUICK_ENTRY_TEXTS } from './quick-entry.texts';

/** Quick entry sheet. Empty for now: phase 3 adds the form. */
@Component({
  selector: 'pl-quick-entry-sheet',
  imports: [PlSheet, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="texts.title">
      <p class="text-[15px] text-muted">{{ texts.comingSoon }}</p>
      <button plButton="secondary" size="lg" type="button" (click)="ref.close()">
        {{ texts.close }}
      </button>
    </pl-sheet>
  `,
})
export class QuickEntrySheet {
  protected readonly texts = QUICK_ENTRY_TEXTS;
  protected readonly ref = inject(DialogRef);
}
