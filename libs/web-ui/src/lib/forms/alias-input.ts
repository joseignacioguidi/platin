import { ChangeDetectionStrategy, Component, forwardRef, input, model, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideX } from '@lucide/angular';
import { normalizeAlias } from '@platin/domain';
import { PlFormControl, plUniqueId } from './form-control';

/** Adds a typed name to the list, normalized and without repeating (pure, for tests). */
export function addAlias(list: readonly string[], typed: string, max: number): string[] {
  const alias = normalizeAlias(typed);
  if (!alias || list.includes(alias) || list.length >= max) return [...list];
  return [...list, alias];
}

/**
 * TXT-02: chips for the "Nombres para escribir" of an account or a card. Enter, comma or
 * space adds the typed name (normalized, as the parser compares it); each chip has its remove
 * button. Works with `[(value)]` and with Reactive Forms.
 */
@Component({
  selector: 'pl-alias-input',
  imports: [LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlAliasInput), multi: true },
  ],
  template: `
    <div
      class="flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30"
    >
      @for (alias of value(); track alias) {
        <span class="inline-flex items-center gap-0.5 rounded-full bg-field py-0.5 pl-3 text-sm">
          {{ alias }}
          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            [attr.aria-label]="removeLabel() + ' ' + alias"
            [disabled]="isDisabled()"
            (click)="remove(alias)"
          >
            <svg lucideX [size]="16" aria-hidden="true"></svg>
          </button>
        </span>
      }
      <input
        type="text"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        maxlength="20"
        class="min-h-9 min-w-24 flex-1 bg-transparent px-2 text-[15px] outline-none"
        [id]="inputId()"
        [attr.aria-describedby]="hintId"
        [placeholder]="value().length > 0 ? '' : placeholder()"
        [disabled]="isDisabled() || value().length >= max()"
        [value]="draft()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="flush()"
      />
    </div>
    <span [id]="hintId" class="sr-only">{{ hint() }}</span>
  `,
})
export class PlAliasInput extends PlFormControl<string[]> {
  readonly value = model<string[]>([]);
  readonly inputId = input(plUniqueId('alias-input'));
  readonly placeholder = input('mp, visa…');
  readonly removeLabel = input('Quitar');
  readonly hint = input('Escribí un nombre y apretá Enter para agregarlo.');
  readonly max = input(10);

  protected readonly hintId = plUniqueId('alias-hint');
  protected readonly draft = signal('');

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    // A comma or a space closes the name being typed.
    if (/[,\s]$/.test(text)) {
      this.draft.set(text.slice(0, -1));
      this.flush();
      (event.target as HTMLInputElement).value = '';
    } else {
      this.draft.set(text);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.flush();
    } else if (event.key === 'Backspace' && !this.draft() && this.value().length > 0) {
      this.remove(this.value()[this.value().length - 1]);
    }
  }

  protected flush(): void {
    const typed = this.draft();
    this.draft.set('');
    if (!typed.trim()) return;
    const next = addAlias(this.value(), typed, this.max());
    if (next.length !== this.value().length) this.commit(next);
  }

  protected remove(alias: string): void {
    this.commit(this.value().filter((existing) => existing !== alias));
  }
}
