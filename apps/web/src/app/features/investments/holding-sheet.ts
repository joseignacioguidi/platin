import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { InvestmentPocket } from '@platin/contracts';
import { PlButton, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { HoldingDraft, HoldingFields, holdingRequest } from './holding-fields';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';

/** INV-07: links an investment that goes by hand to an instrument, from its detail. */
@Component({
  selector: 'pl-holding-sheet',
  imports: [PlSheet, PlButton, HoldingFields],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.linkAction + ' · ' + pocket.name">
      <p class="text-sm text-muted">{{ t.linkHint }}</p>
      <pl-holding-fields
        [type]="pocket.instrument ?? 'OTHER'"
        [currency]="pocket.currency"
        [(draft)]="draft"
      />
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ t.save }}
      </button>
    </pl-sheet>
  `,
})
export class HoldingSheet {
  protected readonly t = INVESTMENTS_TEXTS.link;
  protected readonly pocket = inject<InvestmentPocket>(DIALOG_DATA);
  private readonly store = inject(InvestmentsStore);
  private readonly ref = inject(DialogRef);
  protected readonly draft = signal<HoldingDraft>({
    mode: 'AUTO',
    listing: this.pocket.pricing.listing,
    units: '',
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    const result = holdingRequest(this.draft());
    if ('error' in result) return this.error.set(result.error);
    if (!result.request) return this.ref.close();
    this.saving.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.store.link(this.pocket.id, result.request));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
