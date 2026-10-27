import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  model,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCheck, LucideChevronDown, LucideDynamicIcon, LucideSearch } from '@lucide/angular';
import { PL_TONE_CLASSES, PlTone } from '../list-item/list-item';
import { PlFormControl, plUniqueId } from './form-control';
import { PlPopover, PlPopoverContext, PlPopoverHandle } from './popover';

export interface PlSelectOption<T = string> {
  value: T;
  label: string;
  /** Secondary text on the right (balance, kind...). */
  hint?: string | null;
  /** Lucide icon name, shown in a tinted badge. */
  icon?: string | null;
  /** Tone of the icon badge, or of a dot when there is no icon. */
  tone?: PlTone | null;
  /** Options with the same group are listed together under that heading. */
  group?: string | null;
  disabled?: boolean;
  /** Extra words the search matches (parent category, currency...). */
  keywords?: string;
}

const DOT_CLASSES: Record<PlTone, string> = {
  brand: 'bg-brand',
  expense: 'bg-expense',
  pending: 'bg-pending',
  transfer: 'bg-transfer',
  card: 'bg-card',
  savings: 'bg-savings',
  muted: 'bg-muted',
};

/** Lowercase without accents, for searching "Educacion" → "Educación". */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

interface Group<T> {
  name: string | null;
  id: string;
  options: { option: PlSelectOption<T>; index: number }[];
}

/**
 * Replaces the native `<select>` (ARIA combobox + listbox): search, icon and tone per option,
 * secondary text, groups and an optional empty option. Anchored panel on desktop, bottom sheet
 * on phones. Works with `[(value)]` and with Reactive Forms.
 */
@Component({
  selector: 'pl-select',
  imports: [NgTemplateOutlet, LucideDynamicIcon, LucideChevronDown, LucideCheck, LucideSearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlSelect), multi: true },
  ],
  host: { class: 'block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      [id]="inputId() ?? triggerId"
      [attr.aria-label]="appearance() === 'tile' || !inputId() ? label() + ': ' + display() : null"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="isOpen() ? listId : null"
      [attr.aria-invalid]="invalid() || null"
      [disabled]="isDisabled()"
      [class]="triggerClass()"
      (click)="open()"
      (keydown)="onTriggerKeydown($event)"
      (blur)="onTouched()"
    >
      @if (appearance() === 'tile') {
        <span class="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span class="text-xs text-muted">{{ label() }}</span>
          <span class="flex w-full min-w-0 items-center gap-2 font-semibold">
            <ng-container [ngTemplateOutlet]="selectedLead" />
            <span class="truncate">{{ display() }}</span>
          </span>
        </span>
      } @else {
        <span class="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ng-container [ngTemplateOutlet]="selectedLead" />
          <span class="truncate" [class.text-muted]="!selected()">{{ display() }}</span>
        </span>
        @if (selected()?.hint) {
          <span class="font-amount shrink-0 text-sm text-muted">{{ selected()?.hint }}</span>
        }
      }
      <svg lucideChevronDown [size]="18" class="shrink-0 text-muted" aria-hidden="true"></svg>
    </button>

    <ng-template #selectedLead>
      @if (selected(); as option) {
        @if (option.icon) {
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-lg"
            [class]="toneClass(option.tone)"
            aria-hidden="true"
          >
            <svg [lucideIcon]="option.icon" [size]="16"></svg>
          </span>
        } @else if (option.tone) {
          <span class="size-2.5 shrink-0 rounded-full" [class]="dotClass(option.tone)"></span>
        }
      }
    </ng-template>

    <ng-template #panel let-sheet="sheet">
      <div
        class="flex flex-col bg-surface text-ink"
        [class]="
          sheet
            ? 'max-h-[80dvh] rounded-t-[28px] px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'max-h-[min(24rem,70dvh)] rounded-2xl border border-line p-1.5 shadow-xl'
        "
      >
        @if (sheet) {
          <div class="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true"></div>
          <p class="px-2 pb-2 text-lg font-bold">{{ label() }}</p>
        }
        @if (isSearchable()) {
          <div class="relative mb-1.5 shrink-0">
            <svg
              lucideSearch
              [size]="18"
              class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              aria-hidden="true"
            ></svg>
            <input
              #search
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              autocomplete="off"
              class="min-h-11 w-full rounded-xl bg-field pr-3 pl-10 text-base placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              [attr.aria-label]="searchLabel()"
              [attr.aria-controls]="listId"
              [attr.aria-activedescendant]="activeOptionId()"
              [placeholder]="searchLabel()"
              [value]="query()"
              (input)="onSearch($event)"
              (keydown)="onListKeydown($event)"
            />
          </div>
        }
        <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- focusable via [tabIndex] -->
        <div
          #list
          role="listbox"
          class="min-h-0 overflow-y-auto overscroll-contain focus:outline-none"
          [id]="listId"
          [attr.aria-label]="label()"
          [attr.aria-activedescendant]="isSearchable() ? null : activeOptionId()"
          [tabIndex]="isSearchable() ? -1 : 0"
          (keydown)="onListKeydown($event)"
        >
          @for (group of groups(); track group.id) {
            <div role="group" [attr.aria-labelledby]="group.name ? group.id : null">
              @if (group.name) {
                <div
                  class="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase"
                  [id]="group.id"
                  role="presentation"
                >
                  {{ group.name }}
                </div>
              }
              @for (item of group.options; track item.index) {
                <!-- Options are reached with aria-activedescendant; the keyboard is handled by the list. -->
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                <div
                  role="option"
                  [id]="optionId(item.index)"
                  [attr.aria-selected]="isSelected(item.option)"
                  [attr.aria-disabled]="item.option.disabled || null"
                  class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3"
                  [class.bg-field]="item.index === active()"
                  [class.opacity-50]="item.option.disabled"
                  (click)="choose(item.option)"
                  (pointermove)="active.set(item.index)"
                >
                  @if (item.option.icon) {
                    <span
                      class="flex size-9 shrink-0 items-center justify-center rounded-xl"
                      [class]="toneClass(item.option.tone)"
                      aria-hidden="true"
                    >
                      <svg [lucideIcon]="item.option.icon" [size]="18"></svg>
                    </span>
                  } @else if (item.option.tone) {
                    <span
                      class="size-2.5 shrink-0 rounded-full"
                      [class]="dotClass(item.option.tone)"
                      aria-hidden="true"
                    ></span>
                  }
                  <span class="min-w-0 flex-1 truncate text-[15px]">{{ item.option.label }}</span>
                  @if (item.option.hint) {
                    <span class="font-amount shrink-0 text-sm text-muted">{{
                      item.option.hint
                    }}</span>
                  }
                  <svg
                    lucideCheck
                    [size]="18"
                    class="shrink-0 text-brand-strong"
                    [class.invisible]="!isSelected(item.option)"
                    aria-hidden="true"
                  ></svg>
                </div>
              }
            </div>
          } @empty {
            <p class="px-3 py-6 text-center text-sm text-muted" role="presentation">
              {{ noResults() }}
            </p>
          }
        </div>
      </div>
    </ng-template>
  `,
})
export class PlSelect<T = string> extends PlFormControl<T | null> {
  readonly value = model<T | null>(null);
  readonly options = input.required<readonly PlSelectOption<T>[]>();
  /** Accessible name; shown inside the box with the `tile` appearance and as the sheet title. */
  readonly label = input.required<string>();
  /** Id of the trigger, for an external `<label for>` (pl-form-field). */
  readonly inputId = input<string>();
  readonly placeholder = input('Elegí una opción');
  /** Adds a first option that clears the value, with this text. */
  readonly emptyLabel = input<string | null>(null);
  /** `auto`: search box when there are more than 7 options. */
  readonly searchable = input<boolean | 'auto'>('auto');
  readonly searchLabel = input('Buscar');
  readonly noResults = input('Sin resultados');
  /** `field`: like a text input. `tile`: small label above a bold value (quick entry). */
  readonly appearance = input<'field' | 'tile'>('field');
  readonly invalid = input(false);

  protected readonly triggerId = plUniqueId('pl-select');
  protected readonly listId = plUniqueId('pl-select-list');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(-1);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<TemplateRef<PlPopoverContext>>('panel');
  private readonly popover = inject(PlPopover);
  private readonly viewContainer = inject(ViewContainerRef);
  private handle: PlPopoverHandle | null = null;

  private readonly allOptions = computed<PlSelectOption<T | null>[]>(() => {
    const empty = this.emptyLabel();
    const options: PlSelectOption<T | null>[] = [...this.options()];
    return empty === null ? options : [{ value: null, label: empty }, ...options];
  });

  protected readonly isSearchable = computed(() => {
    const searchable = this.searchable();
    return searchable === 'auto' ? this.options().length > 7 : searchable;
  });

  /** Options matching the search, in order. */
  protected readonly visible = computed(() => {
    const query = normalizeSearch(this.query());
    const options = this.allOptions();
    if (!query) return options;
    return options.filter((option) =>
      normalizeSearch(`${option.label} ${option.keywords ?? ''} ${option.group ?? ''}`).includes(
        query,
      ),
    );
  });

  protected readonly groups = computed<Group<T | null>[]>(() => {
    const groups: Group<T | null>[] = [];
    this.visible().forEach((option, index) => {
      const name = option.group ?? null;
      let group = groups.find((g) => g.name === name);
      if (!group) {
        group = { name, id: `${this.listId}-group-${groups.length}`, options: [] };
        groups.push(group);
      }
      group.options.push({ option, index });
    });
    // Keeps visual order equal to keyboard order.
    let index = 0;
    for (const group of groups) for (const item of group.options) item.index = index++;
    return groups;
  });

  /** Visible options in the order they are drawn (groups together). */
  private readonly ordered = computed(() =>
    this.groups().flatMap((group) => group.options.map((item) => item.option)),
  );

  protected readonly selected = computed(() =>
    this.allOptions().find((option) => option.value !== null && option.value === this.value()),
  );
  protected readonly display = computed(
    () => this.selected()?.label ?? (this.emptyLabel() || this.placeholder()),
  );
  protected readonly activeOptionId = computed(() =>
    this.active() >= 0 && this.active() < this.ordered().length
      ? this.optionId(this.active())
      : null,
  );

  protected readonly triggerClass = computed(() => {
    const base =
      'flex w-full items-center gap-2 rounded-2xl border bg-surface px-4 text-base text-ink ' +
      'transition-colors focus:outline-none focus-visible:border-brand focus-visible:ring-2 ' +
      'focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60';
    const border = this.invalid() ? 'border-expense' : this.isOpen() ? 'border-brand' : 'border-line';
    return this.appearance() === 'tile'
      ? `${base} ${border} min-h-[60px] py-2`
      : `${base} ${border} min-h-12`;
  });

  protected optionId(index: number): string {
    return `${this.listId}-option-${index}`;
  }

  protected isSelected(option: PlSelectOption<T | null>): boolean {
    return option.value === this.value();
  }

  protected toneClass(tone: PlTone | null | undefined): string {
    return PL_TONE_CLASSES[tone ?? 'muted'];
  }

  protected dotClass(tone: PlTone): string {
    return DOT_CLASSES[tone];
  }

  open(): void {
    if (this.isOpen() || this.isDisabled()) return;
    this.query.set('');
    this.isOpen.set(true);
    const selectedIndex = this.ordered().findIndex((option) => this.isSelected(option));
    this.active.set(selectedIndex >= 0 ? selectedIndex : this.firstEnabled(0, 1));
    this.handle = this.popover.open(
      this.panel(),
      this.viewContainer,
      this.trigger().nativeElement,
      () => {
        this.isOpen.set(false);
        this.handle = null;
      },
    );
    // Focus the search box (or the list) once the panel is in the DOM.
    requestAnimationFrame(() => {
      const list = document.getElementById(this.listId);
      const search = list?.parentElement?.querySelector<HTMLInputElement>('input[role=combobox]');
      // On phones the keyboard would cover the sheet: focus the list, the search is optional.
      (this.handle?.sheet ? list : (search ?? list))?.focus();
      this.scrollActiveIntoView();
    });
  }

  close(): void {
    this.handle?.close();
  }

  protected choose(option: PlSelectOption<T | null>): void {
    if (option.disabled) return;
    this.commit(option.value);
    this.close();
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(this.firstEnabled(0, 1));
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.open();
    }
  }

  protected onListKeydown(event: KeyboardEvent): void {
    const count = this.ordered().length;
    switch (event.key) {
      case 'ArrowDown':
        this.move(event, this.firstEnabled(this.active() + 1, 1));
        break;
      case 'ArrowUp':
        this.move(event, this.firstEnabled(this.active() - 1, -1));
        break;
      case 'Home':
        if (event.target instanceof HTMLInputElement) return;
        this.move(event, this.firstEnabled(0, 1));
        break;
      case 'End':
        if (event.target instanceof HTMLInputElement) return;
        this.move(event, this.firstEnabled(count - 1, -1));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.ordered()[this.active()];
        if (option) this.choose(option);
        break;
      }
      case ' ':
        if (event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        if (this.ordered()[this.active()]) this.choose(this.ordered()[this.active()]);
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  private move(event: KeyboardEvent, index: number): void {
    event.preventDefault();
    if (index < 0) return;
    this.active.set(index);
    this.scrollActiveIntoView();
  }

  /** First enabled option from `start` in `step` direction (-1 when there is none). */
  private firstEnabled(start: number, step: 1 | -1): number {
    const options = this.ordered();
    for (let i = start; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return -1;
  }

  private scrollActiveIntoView(): void {
    requestAnimationFrame(() => {
      const id = this.activeOptionId();
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
    });
  }
}
