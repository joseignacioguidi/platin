import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideArrowDownToLine, LucideChevronRight, LucidePencil } from '@lucide/angular';
import type { Pocket } from '@platin/contracts';
import { PlBottomSheet, PlSheet } from '@platin/web-ui';
import { ACCOUNTS_TEXTS } from './accounts.texts';
import { AdjustBalanceSheet } from './adjust-balance-sheet';
import { MoveSheet, MoveSheetData } from './move-sheet';

/**
 * CTA-06: "Ajustar saldo" of a reserve opens two options: money in from an account (a
 * transfer) or adjusting the balance (in an investment, updating its value).
 */
@Component({
  selector: 'pl-adjust-choice-sheet',
  imports: [PlSheet, LucideArrowDownToLine, LucidePencil, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="t.title + ' · ' + reserve.name">
      <ul class="flex flex-col gap-2">
        <li>
          <button type="button" [class]="option" (click)="deposit()">
            <span [class]="icon + ' bg-transfer-soft text-transfer'" aria-hidden="true">
              <svg lucideArrowDownToLine [size]="20"></svg>
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{ t.deposit }}</span>
              <span class="text-sm text-muted">{{ t.depositHint }}</span>
            </span>
            <svg
              lucideChevronRight
              [size]="18"
              class="shrink-0 text-muted"
              aria-hidden="true"
            ></svg>
          </button>
        </li>
        <li>
          <button type="button" [class]="option" (click)="adjust()">
            <span [class]="icon + ' bg-brand-soft text-brand-strong'" aria-hidden="true">
              <svg lucidePencil [size]="20"></svg>
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-semibold">{{ valuation ? t.value : t.adjust }}</span>
              <span class="text-sm text-muted">{{ valuation ? t.valueHint : t.adjustHint }}</span>
            </span>
            <svg
              lucideChevronRight
              [size]="18"
              class="shrink-0 text-muted"
              aria-hidden="true"
            ></svg>
          </button>
        </li>
      </ul>
    </pl-sheet>
  `,
})
export class AdjustChoiceSheet {
  protected readonly t = ACCOUNTS_TEXTS.adjustChoice;
  protected readonly reserve = inject<Pocket>(DIALOG_DATA);
  protected readonly valuation = this.reserve.kind === 'INVESTMENT';
  protected readonly option =
    'flex min-h-16 w-full items-center gap-3 rounded-tile bg-field px-4 py-3 text-left';
  protected readonly icon = 'flex size-10 shrink-0 items-center justify-center rounded-xl';
  private readonly ref = inject(DialogRef);
  private readonly sheet = inject(PlBottomSheet);

  protected deposit(): void {
    this.ref.close();
    this.sheet.open(MoveSheet, {
      data: { reserve: this.reserve, direction: 'IN' } satisfies MoveSheetData,
      ariaLabel: ACCOUNTS_TEXTS.move.titles.IN(this.reserve.name),
    });
  }

  protected adjust(): void {
    this.ref.close();
    this.sheet.open(AdjustBalanceSheet, {
      data: this.reserve,
      ariaLabel: ACCOUNTS_TEXTS.adjust.kinds[this.reserve.kind].title,
    });
  }
}
