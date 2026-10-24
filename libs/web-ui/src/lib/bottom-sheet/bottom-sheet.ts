import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { createBlockScrollStrategy, createGlobalPositionStrategy } from '@angular/cdk/overlay';
import { ComponentType } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  Injector,
  input,
} from '@angular/core';

export interface PlBottomSheetOptions<D> {
  data?: D;
  /** Accessible name of the sheet (required: sheets are dialogs). */
  ariaLabel: string;
}

/**
 * Opens a component in a bottom sheet (a CDK dialog anchored to the bottom).
 * Focus is trapped inside and restored on close; Escape and the backdrop close it.
 */
@Injectable({ providedIn: 'root' })
export class PlBottomSheet {
  private readonly dialog = inject(Dialog);
  private readonly injector = inject(Injector);

  open<C, D = unknown, R = unknown>(
    component: ComponentType<C>,
    options: PlBottomSheetOptions<D>,
  ): DialogRef<R, C> {
    return this.dialog.open<R, D, C>(component, {
      data: options.data,
      ariaLabel: options.ariaLabel,
      width: '100%',
      maxWidth: '32rem',
      panelClass: 'pl-bottom-sheet-panel',
      backdropClass: 'pl-bottom-sheet-backdrop',
      positionStrategy: createGlobalPositionStrategy(this.injector)
        .centerHorizontally()
        .bottom('0'),
      scrollStrategy: createBlockScrollStrategy(this.injector),
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}

/** Visual frame of a bottom sheet: rounded top, drag handle and safe-area padding. */
@Component({
  selector: 'pl-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-surface px-5 pt-3 text-ink"
      style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
    >
      <div class="mx-auto h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true"></div>
      @if (heading()) {
        <h2 class="text-lg font-bold">{{ heading() }}</h2>
      }
      <ng-content />
    </div>
  `,
})
export class PlSheet {
  readonly heading = input<string>();
}
