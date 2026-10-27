import {
  createBlockScrollStrategy,
  createFlexibleConnectedPositionStrategy,
  createGlobalPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy,
  OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { inject, Injectable, Injector, TemplateRef, ViewContainerRef } from '@angular/core';

/** Context of the panel template: `sheet` is true on phones (bottom sheet layout). */
export interface PlPopoverContext {
  sheet: boolean;
}

export interface PlPopoverHandle {
  readonly sheet: boolean;
  close(restoreFocus?: boolean): void;
}

/** Same breakpoint as Tailwind's `sm`: below it, pickers open as a bottom sheet. */
const DESKTOP_QUERY = '(min-width: 640px)';

/**
 * Opens the panel of a picker (select, date field): anchored below its trigger on desktop and
 * as a bottom sheet on phones. Escape and a click outside close it; focus returns to the trigger.
 */
@Injectable({ providedIn: 'root' })
export class PlPopover {
  private readonly injector = inject(Injector);

  open(
    template: TemplateRef<PlPopoverContext>,
    viewContainer: ViewContainerRef,
    anchor: HTMLElement,
    onClosed: () => void,
  ): PlPopoverHandle {
    const sheet = !globalThis.matchMedia?.(DESKTOP_QUERY).matches;
    const overlay = sheet ? this.sheetOverlay() : this.dropdownOverlay(anchor);
    overlay.attach(new TemplatePortal(template, viewContainer, { sheet }));

    let closed = false;
    const close = (restoreFocus = true) => {
      if (closed) return;
      closed = true;
      overlay.dispose();
      onClosed();
      if (restoreFocus) anchor.focus();
    };
    overlay.backdropClick().subscribe(() => close());
    overlay.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    overlay.detachments().subscribe(() => close(false));
    return { sheet, close };
  }

  private sheetOverlay(): OverlayRef {
    return createOverlayRef(this.injector, {
      positionStrategy: createGlobalPositionStrategy(this.injector)
        .centerHorizontally()
        .bottom('0'),
      scrollStrategy: createBlockScrollStrategy(this.injector),
      hasBackdrop: true,
      backdropClass: 'pl-bottom-sheet-backdrop',
      panelClass: 'pl-bottom-sheet-panel',
      width: '100%',
      maxWidth: '32rem',
    });
  }

  private dropdownOverlay(anchor: HTMLElement): OverlayRef {
    return createOverlayRef(this.injector, {
      positionStrategy: createFlexibleConnectedPositionStrategy(this.injector, anchor)
        .withPositions([
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
          { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
        ])
        .withPush(true)
        .withViewportMargin(8),
      scrollStrategy: createRepositionScrollStrategy(this.injector),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      minWidth: anchor.getBoundingClientRect().width,
    });
  }
}
