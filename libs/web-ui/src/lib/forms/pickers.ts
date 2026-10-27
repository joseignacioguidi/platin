import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  input,
  model,
  viewChildren,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { PL_TONE_CLASSES, PlTone } from '../list-item/list-item';
import { PlFormControl } from './form-control';

export interface PlIconChoice {
  /** Lucide icon name (kebab-case). */
  name: string;
  /** Spanish name, read by screen readers. */
  label: string;
}

/** Palette tokens a category or account can use, with their Spanish names. */
export const PL_COLOR_CHOICES: readonly { tone: PlTone; label: string }[] = [
  { tone: 'brand', label: 'Verde' },
  { tone: 'expense', label: 'Coral' },
  { tone: 'pending', label: 'Amarillo' },
  { tone: 'transfer', label: 'Azul' },
  { tone: 'card', label: 'Violeta' },
  { tone: 'savings', label: 'Celeste' },
  { tone: 'muted', label: 'Gris' },
];

const SWATCHES: Record<PlTone, string> = {
  brand: 'bg-brand',
  expense: 'bg-expense',
  pending: 'bg-pending',
  transfer: 'bg-transfer',
  card: 'bg-card',
  savings: 'bg-savings',
  muted: 'bg-muted',
};

/** Arrow-key navigation shared by the radio grids below (roving tabindex). */
function moveFocus(
  event: KeyboardEvent,
  index: number,
  count: number,
  columns: number,
): number | null {
  const step: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  };
  if (event.key === 'Home') return 0;
  if (event.key === 'End') return count - 1;
  const delta = step[event.key];
  if (delta === undefined) return null;
  const next = index + delta;
  return next < 0 || next >= count ? null : next;
}

/** Icon choice as a radio grid of tinted icons (pl-icon-picker). */
@Component({
  selector: 'pl-icon-picker',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlIconPicker), multi: true },
  ],
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="label()"
      class="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5"
    >
      @for (icon of icons(); track icon.name; let i = $index) {
        <button
          #choice
          type="button"
          role="radio"
          class="flex size-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          [class]="icon.name === value() ? toneClass() + ' ring-2 ring-ink' : 'bg-field text-ink hover:bg-line-soft'"
          [attr.aria-checked]="icon.name === value()"
          [attr.aria-label]="icon.label"
          [title]="icon.label"
          [tabIndex]="isTabStop(icon.name, i) ? 0 : -1"
          [disabled]="isDisabled()"
          (click)="commit(icon.name)"
          (keydown)="onKeydown($event, i)"
        >
          <svg [lucideIcon]="icon.name" [size]="20"></svg>
        </button>
      }
    </div>
  `,
})
export class PlIconPicker extends PlFormControl<string | null> {
  readonly value = model<string | null>(null);
  readonly icons = input.required<readonly PlIconChoice[]>();
  readonly label = input.required<string>();
  /** Tint of the selected icon (the chosen color). */
  readonly tone = input<PlTone>('brand');

  private readonly choices = viewChildren<ElementRef<HTMLButtonElement>>('choice');

  protected toneClass(): string {
    return PL_TONE_CLASSES[this.tone()];
  }

  protected isTabStop(name: string, index: number): boolean {
    const value = this.value();
    return value && this.icons().some((icon) => icon.name === value) ? name === value : index === 0;
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const columns = Math.max(
      1,
      Math.round(
        (this.choices()[0]?.nativeElement.parentElement?.clientWidth ?? 44) / 50,
      ),
    );
    const next = moveFocus(event, index, this.icons().length, columns);
    if (next === null) return;
    event.preventDefault();
    this.commit(this.icons()[next].name);
    this.choices()[next]?.nativeElement.focus();
  }
}

/** Color choice among the palette tokens, as a radio group of swatches (pl-color-picker). */
@Component({
  selector: 'pl-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlColorPicker), multi: true },
  ],
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" class="flex flex-wrap gap-2">
      @for (color of colors; track color.tone; let i = $index) {
        <button
          #choice
          type="button"
          role="radio"
          class="flex size-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          [attr.aria-checked]="color.tone === value()"
          [attr.aria-label]="color.label"
          [title]="color.label"
          [tabIndex]="(value() ?? colors[0].tone) === color.tone ? 0 : -1"
          [disabled]="isDisabled()"
          (click)="commit(color.tone)"
          (keydown)="onKeydown($event, i)"
        >
          <span
            class="size-8 rounded-full"
            [class]="swatch(color.tone)"
            [class.ring-2]="color.tone === value()"
            [class.ring-ink]="color.tone === value()"
            [class.ring-offset-2]="color.tone === value()"
            [class.ring-offset-surface]="color.tone === value()"
          ></span>
        </button>
      }
    </div>
  `,
})
export class PlColorPicker extends PlFormControl<PlTone | null> {
  readonly value = model<PlTone | null>(null);
  readonly label = input.required<string>();
  protected readonly colors = PL_COLOR_CHOICES;

  private readonly choices = viewChildren<ElementRef<HTMLButtonElement>>('choice');

  protected swatch(tone: PlTone): string {
    return SWATCHES[tone];
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const next = moveFocus(event, index, this.colors.length, this.colors.length);
    if (next === null) return;
    event.preventDefault();
    this.commit(this.colors[next].tone);
    this.choices()[next]?.nativeElement.focus();
  }
}
