import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

export const MIN_INSTALLMENTS = 1;
export const MAX_INSTALLMENTS = 60;

const TEXTS = {
  group: 'Cuotas',
  onePayment: '1 pago',
  installments: (n: number) => `${n} cuotas`,
  other: 'Otra',
  otherLabel: 'Otra cantidad de cuotas',
  change: (n: number) => `${n === 1 ? '1 pago' : `${n} cuotas`}. Tocá para cambiar la cantidad`,
  input: 'Cantidad de cuotas, de 1 a 60',
  done: 'Listo',
  invalid: 'Entre 1 y 60',
};

/** The label of a count: "1 pago", "6 cuotas". */
export const installmentsLabel = (n: number): string =>
  n === 1 ? TEXTS.onePayment : TEXTS.installments(n);

/** A whole count between 1 and 60, or null. */
export function parseInstallments(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= MIN_INSTALLMENTS && n <= MAX_INSTALLMENTS ? n : null;
}

/**
 * TAR-02 (iteration 9): the number of installments in one row, without scrolling: the card's two
 * most used counts and "Otra", which opens a field from 1 to 60. A count that is neither of the
 * two (chosen with "Otra" or brought by a written text) shows in the third option.
 */
@Component({
  selector: 'pl-installments-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="group" [attr.aria-label]="texts.group" class="grid grid-cols-3 gap-2">
      @for (n of top(); track n) {
        <button
          type="button"
          [class]="optionClass(value() === n)"
          [attr.aria-pressed]="value() === n"
          [disabled]="disabled()"
          (click)="choose(n)"
        >
          {{ label(n) }}
        </button>
      }
      @if (editing()) {
        <div
          class="flex min-h-11 items-center rounded-full border bg-surface pl-3"
          [class.border-ink]="!invalid()"
          [class.border-expense]="invalid()"
        >
          <input
            #field
            type="text"
            inputmode="numeric"
            maxlength="2"
            class="font-amount w-full min-w-0 bg-transparent text-center text-[15px] tabular-nums outline-none"
            [attr.aria-label]="texts.input"
            [attr.aria-invalid]="invalid()"
            [attr.aria-describedby]="invalid() ? errorId : null"
            [value]="draft()"
            (input)="onInput($event)"
            (keydown.enter)="$event.preventDefault(); confirm()"
            (keydown.escape)="$event.preventDefault(); cancel()"
          />
          <button
            type="button"
            class="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-brand-strong"
            [attr.aria-label]="texts.done"
            (click)="confirm()"
          >
            OK
          </button>
        </div>
      } @else {
        <button
          type="button"
          [class]="optionClass(isOther())"
          [attr.aria-pressed]="isOther()"
          [attr.aria-label]="isOther() ? texts.change(value()) : texts.otherLabel"
          [disabled]="disabled()"
          (click)="edit()"
        >
          {{ isOther() ? label(value()) : texts.other }}
        </button>
      }
    </div>
    @if (editing() && invalid()) {
      <p [id]="errorId" class="mt-1 text-right text-xs text-expense-ink" role="alert">
        {{ texts.invalid }}
      </p>
    }
  `,
})
export class PlInstallmentsPicker {
  /** The card's two most used counts (GET /cards `topInstallments`). */
  readonly top = input.required<readonly [number, number]>();
  readonly value = model.required<number>();
  readonly disabled = input(false);

  protected readonly texts = TEXTS;
  protected readonly errorId = `pl-installments-error-${nextId++}`;
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly invalid = signal(false);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly isOther = computed(() => !this.top().includes(this.value()));
  protected readonly label = installmentsLabel;

  protected optionClass(selected: boolean): string {
    const base =
      'inline-flex min-h-11 min-w-0 items-center justify-center rounded-full px-2 text-[15px] font-medium whitespace-nowrap transition-colors disabled:opacity-60';
    return selected
      ? `${base} bg-ink font-semibold text-on-ink`
      : `${base} border border-line bg-surface text-ink hover:bg-field`;
  }

  protected choose(n: number): void {
    this.editing.set(false);
    this.value.set(n);
  }

  protected edit(): void {
    this.draft.set(this.isOther() ? String(this.value()) : '');
    this.invalid.set(false);
    this.editing.set(true);
    // Focus the field once it is rendered.
    queueMicrotask(() => this.field()?.nativeElement.focus());
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    this.invalid.set(false);
  }

  protected confirm(): void {
    const n = parseInstallments(this.draft());
    if (n === null) {
      this.invalid.set(true);
      return;
    }
    this.value.set(n);
    this.editing.set(false);
  }

  protected cancel(): void {
    this.editing.set(false);
  }
}

let nextId = 0;
