import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  InjectionToken,
  input,
  model,
  Signal,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideCalendar, LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import {
  addDays,
  addMonths,
  compareDates,
  dateParts,
  daysInMonth,
  LocalDate,
  localDateAt,
  makeLocalDate,
  makePeriod,
  periodParts,
} from '@platin/domain';
import { formatLongDate, formatMonthYear } from '../format/format';
import { PlFormControl, plUniqueId } from './form-control';
import { PlPopover, PlPopoverContext, PlPopoverHandle } from './popover';

/** "Today" in the app's time zone; the app provides its own clock. */
export const PL_TODAY = new InjectionToken<Signal<LocalDate>>('PL_TODAY', {
  providedIn: 'root',
  factory: () => signal(localDateAt(new Date())),
});

const WEEKDAYS = [
  { short: 'L', long: 'lunes' },
  { short: 'M', long: 'martes' },
  { short: 'M', long: 'miércoles' },
  { short: 'J', long: 'jueves' },
  { short: 'V', long: 'viernes' },
  { short: 'S', long: 'sábado' },
  { short: 'D', long: 'domingo' },
];

interface Day {
  date: LocalDate;
  day: number;
  inMonth: boolean;
  disabled: boolean;
}

/** Monday-first weeks covering the month of `date`. */
export function monthGrid(year: number, month: number): LocalDate[][] {
  const first = makeLocalDate(year, month, 1);
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const start = addDays(first, -((weekday + 6) % 7));
  const lastDay = makeLocalDate(year, month, daysInMonth(year, month));
  const weeks: LocalDate[][] = [];
  let cursor = start;
  while (compareDates(cursor, lastDay) <= 0) {
    const week: LocalDate[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Same day in another month, clamped to that month's length (31 Jan + 1 → 28/29 Feb). */
function shiftMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = dateParts(date);
  const target = periodParts(addMonths(makePeriod(year, month), months));
  return makeLocalDate(
    target.year,
    target.month,
    Math.min(day, daysInMonth(target.year, target.month)),
  );
}

/**
 * Replaces `<input type="date">`: a button with the date in Spanish ("Hoy", "lunes 27 de
 * octubre") that opens a calendar with Hoy/Ayer shortcuts, min/max and full keyboard support
 * (ARIA grid). Anchored on desktop, bottom sheet on phones.
 */
@Component({
  selector: 'pl-date-field',
  imports: [LucideCalendar, LucideChevronLeft, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PlDateField), multi: true },
  ],
  host: { class: 'block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      aria-haspopup="dialog"
      [id]="inputId() ?? triggerId"
      [attr.aria-label]="label() + ': ' + display()"
      [attr.aria-expanded]="isOpen()"
      [disabled]="isDisabled()"
      [class]="triggerClass()"
      (click)="open()"
      (blur)="onTouched()"
    >
      @if (appearance() === 'tile') {
        <span class="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span class="text-xs text-muted">{{ label() }}</span>
          <span class="truncate font-semibold">{{ display() }}</span>
        </span>
      } @else {
        <span class="min-w-0 flex-1 truncate text-left first-letter:uppercase">{{
          display()
        }}</span>
        <svg lucideCalendar [size]="18" class="shrink-0 text-muted" aria-hidden="true"></svg>
      }
    </button>

    <ng-template #panel let-sheet="sheet">
      <div
        role="dialog"
        [attr.aria-label]="label()"
        class="flex w-full flex-col gap-3 bg-surface text-ink"
        [class]="
          sheet
            ? 'rounded-t-[28px] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'w-[320px] rounded-2xl border border-line p-3 shadow-xl'
        "
      >
        @if (sheet) {
          <div class="mx-auto h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true"></div>
          <p class="text-lg font-bold">{{ label() }}</p>
        }
        <div class="flex gap-2">
          @for (shortcut of shortcuts(); track shortcut.label) {
            <button
              type="button"
              class="min-h-11 flex-1 rounded-full border text-[15px] font-medium transition-colors disabled:opacity-40"
              [class]="
                shortcut.date === value()
                  ? 'border-ink bg-ink text-on-ink'
                  : 'border-line bg-surface hover:bg-field'
              "
              [disabled]="shortcut.disabled"
              (click)="choose(shortcut.date)"
            >
              {{ shortcut.label }}
            </button>
          }
        </div>
        <div class="flex items-center justify-between">
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full hover:bg-field disabled:opacity-30"
            [attr.aria-label]="previousLabel"
            [disabled]="!canGoPrevious()"
            (click)="moveMonth(-1)"
          >
            <svg lucideChevronLeft [size]="20"></svg>
          </button>
          <p class="font-semibold" aria-live="polite" [id]="titleId">{{ title() }}</p>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full hover:bg-field disabled:opacity-30"
            [attr.aria-label]="nextLabel"
            [disabled]="!canGoNext()"
            (click)="moveMonth(1)"
          >
            <svg lucideChevronRight [size]="20"></svg>
          </button>
        </div>
        <table
          role="grid"
          class="w-full table-fixed border-collapse"
          [attr.aria-labelledby]="titleId"
        >
          <thead>
            <tr>
              @for (weekday of weekdays; track $index) {
                <th scope="col" class="pb-1 text-xs font-medium text-muted">
                  <abbr [title]="weekday.long" class="no-underline">{{ weekday.short }}</abbr>
                </th>
              }
            </tr>
          </thead>
          <!-- Arrow keys bubble up from the focused day button (roving tabindex). -->
          <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
          <tbody (keydown)="onGridKeydown($event)">
            @for (week of weeks(); track $index) {
              <tr>
                @for (day of week; track day.date) {
                  <td
                    role="gridcell"
                    class="p-0.5 text-center"
                    [attr.aria-selected]="day.date === value()"
                  >
                    <button
                      type="button"
                      class="font-amount mx-auto flex size-10 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-30"
                      [class]="dayClass(day)"
                      [attr.data-date]="day.date"
                      [attr.aria-label]="dayLabel(day.date)"
                      [attr.aria-current]="day.date === today() ? 'date' : null"
                      [tabIndex]="day.date === focused() ? 0 : -1"
                      [disabled]="day.disabled"
                      (click)="choose(day.date)"
                    >
                      {{ day.day }}
                    </button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>
  `,
})
export class PlDateField extends PlFormControl<LocalDate | null> {
  readonly value = model<LocalDate | null>(null);
  readonly label = input.required<string>();
  readonly inputId = input<string>();
  readonly min = input<LocalDate | null>(null);
  readonly max = input<LocalDate | null>(null);
  readonly placeholder = input('Elegí una fecha');
  readonly appearance = input<'field' | 'tile'>('field');

  protected readonly today = inject(PL_TODAY);
  protected readonly weekdays = WEEKDAYS;
  protected readonly previousLabel = 'Mes anterior';
  protected readonly nextLabel = 'Mes siguiente';
  protected readonly triggerId = plUniqueId('pl-date');
  protected readonly titleId = plUniqueId('pl-date-title');
  protected readonly isOpen = signal(false);
  /** Day with keyboard focus; its month is the one shown. */
  protected readonly focused = signal<LocalDate>(this.today());

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<TemplateRef<PlPopoverContext>>('panel');
  private readonly popover = inject(PlPopover);
  private readonly viewContainer = inject(ViewContainerRef);
  private handle: PlPopoverHandle | null = null;

  protected readonly display = computed(() => {
    const value = this.value();
    return value ? formatLongDate(value, this.today()) : this.placeholder();
  });

  protected readonly title = computed(() => {
    const { year, month } = dateParts(this.focused());
    return formatMonthYear(year, month);
  });

  protected readonly weeks = computed<Day[][]>(() => {
    const { year, month } = dateParts(this.focused());
    return monthGrid(year, month).map((week) =>
      week.map((date) => ({
        date,
        day: dateParts(date).day,
        inMonth: dateParts(date).month === month,
        disabled: !this.inRange(date),
      })),
    );
  });

  protected readonly shortcuts = computed(() => {
    const today = this.today();
    const yesterday = addDays(today, -1);
    return [
      { label: 'Hoy', date: today, disabled: !this.inRange(today) },
      { label: 'Ayer', date: yesterday, disabled: !this.inRange(yesterday) },
    ];
  });

  protected readonly canGoPrevious = computed(() => {
    const min = this.min();
    if (!min) return true;
    const { year, month } = dateParts(this.focused());
    return compareDates(makeLocalDate(year, month, 1), min) > 0;
  });

  protected readonly canGoNext = computed(() => {
    const max = this.max();
    if (!max) return true;
    const { year, month } = dateParts(this.focused());
    return compareDates(makeLocalDate(year, month, daysInMonth(year, month)), max) < 0;
  });

  protected readonly triggerClass = computed(() => {
    const base =
      'flex w-full items-center gap-2 rounded-2xl border bg-surface px-4 text-base text-ink ' +
      'transition-colors focus:outline-none focus-visible:border-brand focus-visible:ring-2 ' +
      'focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60';
    const border = this.isOpen() ? 'border-brand' : 'border-line';
    return this.appearance() === 'tile'
      ? `${base} ${border} min-h-[60px] py-2`
      : `${base} ${border} min-h-12`;
  });

  protected dayClass(day: Day): string {
    if (day.date === this.value()) return 'bg-ink font-semibold text-on-ink';
    const muted = day.inMonth ? '' : 'text-muted';
    const today = day.date === this.today() ? 'border border-brand' : '';
    return `${muted} ${today} hover:bg-field`;
  }

  protected dayLabel(date: LocalDate): string {
    const text = formatLongDate(date, this.today());
    const { year } = dateParts(date);
    return /\d{4}$/.test(text) || text === 'Hoy' || text === 'Ayer' ? text : `${text} de ${year}`;
  }

  open(): void {
    if (this.isOpen() || this.isDisabled()) return;
    this.focused.set(this.clamp(this.value() ?? this.today()));
    this.isOpen.set(true);
    this.handle = this.popover.open(
      this.panel(),
      this.viewContainer,
      this.trigger().nativeElement,
      () => {
        this.isOpen.set(false);
        this.handle = null;
      },
    );
    this.focusDay();
  }

  close(): void {
    this.handle?.close();
  }

  protected choose(date: LocalDate): void {
    if (!this.inRange(date)) return;
    this.commit(date);
    this.close();
  }

  protected moveMonth(months: number): void {
    this.focused.set(this.clamp(shiftMonths(this.focused(), months)));
  }

  protected onGridKeydown(event: KeyboardEvent): void {
    const focused = this.focused();
    // Picks the day moved to with the keys, even if DOM focus hasn't caught up yet.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.choose(focused);
      return;
    }
    const weekday = (new Date(`${focused}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
    const moves: Record<string, () => LocalDate> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
      PageUp: () => shiftMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: () => shiftMonths(focused, event.shiftKey ? 12 : 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.focused.set(this.clamp(move()));
    this.focusDay();
  }

  private inRange(date: LocalDate): boolean {
    const min = this.min();
    const max = this.max();
    return (!min || compareDates(date, min) >= 0) && (!max || compareDates(date, max) <= 0);
  }

  private clamp(date: LocalDate): LocalDate {
    const min = this.min();
    const max = this.max();
    if (min && compareDates(date, min) < 0) return min;
    if (max && compareDates(date, max) > 0) return max;
    return date;
  }

  /** Moves DOM focus to the focused day once the grid is rendered. */
  private focusDay(): void {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`button[data-date="${this.focused()}"]:not([disabled])`)
        ?.focus();
    });
  }
}
