import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { parseInstallments, PlInstallmentsPicker } from './installments-picker';

@Component({
  imports: [PlInstallmentsPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<pl-installments-picker [top]="top()" [(value)]="count" />`,
})
class Host {
  readonly top = signal<readonly [number, number]>([1, 3]);
  readonly count = signal(1);
}

describe('parseInstallments', () => {
  it('accepts whole counts from 1 to 60', () => {
    expect(parseInstallments('1')).toBe(1);
    expect(parseInstallments(' 18 ')).toBe(18);
    expect(parseInstallments('60')).toBe(60);
    for (const text of ['0', '61', '', '2.5', '-3', 'doce']) {
      expect(parseInstallments(text)).toBeNull();
    }
  });
});

describe('pl-installments-picker', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="group"] > button'));
    return { fixture, el, buttons };
  }

  it('shows the two most used and "Otra" in one row', async () => {
    const { buttons } = await render();
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['1 pago', '3 cuotas', 'Otra']);
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('"Otra" lets you type 18 and the option says "18 cuotas"', async () => {
    const { fixture, el, buttons } = await render();
    buttons()[2].click();
    await fixture.whenStable();
    const field = el.querySelector<HTMLInputElement>('input');
    if (!field) throw new Error('no field');
    field.value = '18';
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.count()).toBe(18);
    expect(buttons()[2].textContent?.trim()).toBe('18 cuotas');
    expect(buttons()[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('rejects a count out of range and keeps the value', async () => {
    const { fixture, el, buttons } = await render();
    buttons()[2].click();
    await fixture.whenStable();
    const field = el.querySelector<HTMLInputElement>('input');
    if (!field) throw new Error('no field');
    field.value = '72';
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.count()).toBe(1);
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Entre 1 y 60');
  });

  it('a count brought from outside ("5c") shows in the third option', async () => {
    const { fixture, buttons } = await render();
    fixture.componentInstance.count.set(5);
    await fixture.whenStable();
    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['1 pago', '3 cuotas', '5 cuotas']);
  });

  it('"Otra" also allows going back to 1 payment when it is not among the two', async () => {
    const { fixture, el, buttons } = await render();
    fixture.componentInstance.top.set([3, 6]);
    fixture.componentInstance.count.set(3);
    await fixture.whenStable();
    buttons()[2].click();
    await fixture.whenStable();
    const field = el.querySelector<HTMLInputElement>('input');
    if (!field) throw new Error('no field');
    field.value = '1';
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.count()).toBe(1);
    expect(buttons()[2].textContent?.trim()).toBe('1 pago');
  });
});
