import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlSheet } from '@platin/web-ui';
import { ONBOARDING_TEXTS } from './onboarding.texts';
import { FOOT_PRIMARY, FOOT_SECONDARY } from './onboarding-shell';

export type ChargesAnswer = 'yes' | 'later';

/** Step 2, after saving a card: "¿Querés cargar tus consumos actuales?" (mockup 2b). */
@Component({
  selector: 'pl-charges-question-sheet',
  imports: [PlSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet>
      <h2 class="text-[22px] font-extrabold leading-tight">{{ t.title }}</h2>
      <p class="text-[15px] leading-[1.45] text-muted">{{ t.body }}</p>
      <div class="flex flex-col gap-1.5">
        <button type="button" [class]="primary" (click)="ref.close('yes')">{{ t.yes }}</button>
        <button type="button" [class]="secondary" (click)="ref.close('later')">
          {{ t.later }}
        </button>
      </div>
      <p class="text-center text-[13px] text-muted">{{ t.hint }}</p>
    </pl-sheet>
  `,
})
export class ChargesQuestionSheet {
  protected readonly t = ONBOARDING_TEXTS.chargesQuestion;
  protected readonly primary = FOOT_PRIMARY;
  protected readonly secondary = FOOT_SECONDARY;
  protected readonly ref = inject<DialogRef<ChargesAnswer>>(DialogRef);
}
