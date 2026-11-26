import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { InvestmentPocket } from '@platin/contracts';
import { PlButton, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { InvestmentsStore } from './investments.store';
import { INVESTMENTS_TEXTS } from './investments.texts';
import {
  draftFromTerms,
  emptyTermDepositDraft,
  TermDepositFields,
  termDepositRequest,
} from './term-deposit-fields';

/** INV-12: sets or edits (renews) the terms of a term deposit. */
@Component({
  selector: 'pl-term-deposit-sheet',
  imports: [PlSheet, PlButton, TermDepositFields],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title + ' · ' + pocket.name">
      <p class="text-sm text-muted">{{ t.hint }}</p>
      <pl-term-deposit-fields [(draft)]="draft" [currency]="pocket.currency" />
      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }
      <button plButton size="lg" type="button" [disabled]="saving()" (click)="save()">
        {{ t.save }}
      </button>
    </pl-sheet>
  `,
})
export class TermDepositSheet {
  protected readonly t = INVESTMENTS_TEXTS.termDeposit;
  protected readonly pocket = inject<InvestmentPocket>(DIALOG_DATA);
  private readonly store = inject(InvestmentsStore);
  private readonly ref = inject(DialogRef);
  protected readonly draft = signal(
    this.pocket.pricing.termDeposit
      ? draftFromTerms(this.pocket.pricing.termDeposit)
      : emptyTermDepositDraft(),
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(): Promise<void> {
    const result = termDepositRequest(this.draft());
    if ('error' in result) return this.error.set(result.error);
    this.saving.set(true);
    this.error.set(null);
    try {
      this.ref.close(await this.store.saveTermDeposit(this.pocket.id, result.request));
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
