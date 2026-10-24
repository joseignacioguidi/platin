import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlButton } from './button/button';
import { HideAmounts } from './money/hide-amounts';
import { PlMoney } from './money/money';
import { PlSegmented, PlSegmentOption } from './segmented/segmented';

@Component({
  imports: [PlMoney, PlSegmented, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-money id="ars" amount="18500.00" />
    <pl-money id="usd" amount="771.43" currency="USD" />
    <pl-money id="cents" amount="18500.50" />
    <pl-segmented label="Tipo" [options]="options" [(value)]="type" />
    <button id="primary" plButton>Guardar</button>
    <button id="secondary" plButton="secondary" size="lg">Cancelar</button>
  `,
})
class Host {
  readonly options: PlSegmentOption<string>[] = [
    { value: 'EXPENSE', label: 'Gasto' },
    { value: 'INCOME', label: 'Ingreso' },
    { value: 'TRANSFER', label: 'Transferencia' },
  ];
  readonly type = signal('EXPENSE');
}

describe('web-ui', () => {
  beforeEach(() => localStorage.clear());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('pl-money formats amounts in es-AR', async () => {
    const { el } = await render();
    expect(el.querySelector('#ars')?.textContent?.trim()).toBe('$ 18.500');
    expect(el.querySelector('#usd')?.textContent?.trim()).toBe('USD 771,43');
    expect(el.querySelector('#cents')?.textContent?.trim()).toBe('$ 18.500,50');
  });

  it('pl-money hides every amount with "ocultar montos"', async () => {
    const { fixture, el } = await render();
    TestBed.inject(HideAmounts).toggle();
    await fixture.whenStable();
    expect(el.querySelector('#ars')?.textContent?.trim()).toBe('$ •••••');
    expect(el.querySelector('#usd')?.textContent).not.toContain('771');
    expect(localStorage.getItem('platin.hideAmounts')).toBe('true');
  });

  it('pl-segmented selects with click and arrow keys', async () => {
    const { fixture, el } = await render();
    const radios = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);

    radios[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.type()).toBe('INCOME');

    radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.type()).toBe('TRANSFER');

    radios[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.type()).toBe('EXPENSE');
  });

  it('pl-button keeps the native button and applies the variant', async () => {
    const { el } = await render();
    expect(el.querySelector('#primary')?.className).toContain('bg-ink');
    expect(el.querySelector('#secondary')?.className).toContain('border-line');
    expect(el.querySelector('#secondary')?.className).toContain('min-h-14');
  });
});
