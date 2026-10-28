import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { LocalDate, parseLocalDate } from '@platin/domain';
import { formatLongDate } from '../format/format';
import { monthGrid, PL_TODAY, PlDateField } from './date-field';
import { normalizeSearch, PlSelect, PlSelectOption } from './select';

const d = (value: string) => parseLocalDate(value);
const TODAY = d('2026-10-27');

describe('formatLongDate', () => {
  it('names today and yesterday', () => {
    expect(formatLongDate(TODAY, TODAY)).toBe('Hoy');
    expect(formatLongDate(d('2026-10-26'), TODAY)).toBe('Ayer');
  });

  it('writes other dates in Spanish, with the year only when it differs', () => {
    expect(formatLongDate(d('2026-10-20'), TODAY)).toBe('martes 20 de octubre');
    expect(formatLongDate(d('2025-12-31'), TODAY)).toBe('miércoles 31 de diciembre de 2025');
  });
});

describe('monthGrid', () => {
  it('covers the month in Monday-first weeks', () => {
    const weeks = monthGrid(2026, 10);
    expect(weeks[0][0]).toBe('2026-09-28'); // October 1st 2026 is a Thursday
    expect(weeks.at(-1)?.at(-1)).toBe('2026-11-01');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('handles a month starting on Monday and February of a leap year', () => {
    expect(monthGrid(2026, 6)[0][0]).toBe('2026-06-01');
    expect(monthGrid(2028, 2).flat()).toContain('2028-02-29');
  });
});

describe('normalizeSearch', () => {
  it('ignores case and accents', () => {
    expect(normalizeSearch('  Educación ')).toBe('educacion');
  });
});

@Component({
  imports: [PlSelect, PlDateField, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-select id="signal-select" label="Cuenta" [options]="options" [(value)]="account" />
    <pl-select
      id="form-select"
      label="Tipo"
      [options]="options"
      emptyLabel="Todas"
      [formControl]="control"
    />
    <pl-date-field id="date" label="Fecha" [max]="today" [(value)]="date" />
  `,
})
class Host {
  readonly options: PlSelectOption[] = [
    { value: 'mp', label: 'Mercado Pago', group: 'Billeteras', hint: '$ 10.000' },
    { value: 'cash', label: 'Efectivo', group: 'Efectivo' },
    { value: 'old', label: 'Vieja', group: 'Efectivo', disabled: true },
  ];
  readonly today = TODAY;
  readonly account = signal<string | null>('mp');
  readonly date = signal<LocalDate | null>(TODAY);
  readonly control = new FormControl<string | null>(null);
}

describe('pl-select and pl-date-field', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PL_TODAY, useValue: signal(TODAY) }],
    });
    // jsdom has no matchMedia: behave like desktop.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    });
  });

  afterEach(() => document.querySelector('.cdk-overlay-container')?.replaceChildren());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const trigger = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLButtonElement>(`#${id} button`) as HTMLButtonElement;
  const key = (target: Element, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  it('shows the selected option as a combobox and lists options by group', async () => {
    const { fixture, el } = await render();
    const button = trigger(el, 'signal-select');
    expect(button.getAttribute('role')).toBe('combobox');
    expect(button.getAttribute('aria-label')).toBe('Cuenta: Mercado Pago');

    button.click();
    await fixture.whenStable();
    const options = [...document.querySelectorAll('[role=option]')];
    expect(options.map((o) => o.querySelector('.flex-1')?.textContent?.trim())).toEqual([
      'Mercado Pago',
      'Efectivo',
      'Vieja',
    ]);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(
      [...document.querySelectorAll('[role=group] > [role=presentation]')].map((g) =>
        g.textContent?.trim(),
      ),
    ).toEqual(['Billeteras', 'Efectivo']);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('chooses with the keyboard, skipping disabled options', async () => {
    const { fixture, el } = await render();
    trigger(el, 'signal-select').click();
    await fixture.whenStable();
    const list = document.querySelector('[role=listbox]') as HTMLElement;
    key(list, 'ArrowDown');
    key(list, 'ArrowDown'); // "Vieja" is disabled: stays on "Efectivo"
    key(list, 'Enter');
    await fixture.whenStable();
    expect(fixture.componentInstance.account()).toBe('cash');
    expect(document.querySelector('[role=listbox]')).toBeNull();
  });

  it('works with Reactive Forms, including the empty option', async () => {
    const { fixture, el } = await render();
    const button = trigger(el, 'form-select');
    expect(button.textContent).toContain('Todas');
    fixture.componentInstance.control.setValue('cash');
    await fixture.whenStable();
    expect(button.textContent).toContain('Efectivo');

    button.click();
    await fixture.whenStable();
    (document.querySelector('[role=option]') as HTMLElement).click(); // "Todas"
    expect(fixture.componentInstance.control.value).toBeNull();

    fixture.componentInstance.control.disable();
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
  });

  it('pl-date-field shows the date in Spanish and respects max', async () => {
    const { fixture, el } = await render();
    const button = trigger(el, 'date');
    expect(button.textContent?.trim()).toBe('Hoy');

    button.click();
    await fixture.whenStable();
    const tomorrow = document.querySelector('button[data-date="2026-10-28"]') as HTMLButtonElement;
    expect(tomorrow.disabled).toBe(true);
    const yesterday = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Ayer',
    ) as HTMLButtonElement;
    yesterday.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.date()).toBe('2026-10-26');
    expect(button.textContent?.trim()).toBe('Ayer');
  });

  it('pl-date-field moves by week with the arrows and picks with Enter', async () => {
    const { fixture, el } = await render();
    trigger(el, 'date').click();
    await fixture.whenStable();
    const grid = document.querySelector('tbody') as HTMLElement;
    key(grid, 'ArrowUp');
    await fixture.whenStable();
    const focused = document.querySelector('button[data-date="2026-10-20"]') as HTMLButtonElement;
    expect(focused.tabIndex).toBe(0);
    // Fast typing: Enter picks the day reached with the keys, not the one DOM focus is on.
    key(grid, 'ArrowLeft');
    key(grid, 'ArrowLeft');
    key(grid, 'Enter');
    expect(fixture.componentInstance.date()).toBe('2026-10-18');
  });
});
