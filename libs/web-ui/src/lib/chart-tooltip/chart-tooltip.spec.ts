import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HideAmounts } from '../money/hide-amounts';
import { PlChartPoint, PlInfoTip } from './chart-tooltip';

@Component({
  imports: [PlChartPoint],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="oct" plChartPoint="Octubre" amount="18500.00"></div>
    <div id="nov" plChartPoint="Noviembre" amount="24.99" currency="USD"></div>
    <div id="users" plChartPoint="Semana del 2 de nov" value="12 usuarios"></div>
    <button id="outside">Afuera</button>
  `,
})
class Host {}

const tooltip = () => document.querySelector('[role=tooltip]');

describe('pl-chart-tooltip (DAS-06)', () => {
  beforeEach(() => localStorage.clear());

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const point = (id: string) => el.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, point, settle };
  }

  afterEach(() => document.querySelector('.cdk-overlay-container')?.replaceChildren());

  it('every point is focusable and labelled with its value', async () => {
    const { point } = await render();
    expect(point('oct').getAttribute('tabindex')).toBe('0');
    expect(point('oct').getAttribute('role')).toBe('img');
    expect(point('oct').getAttribute('aria-label')).toBe('Octubre: $ 18.500');
    expect(point('nov').getAttribute('aria-label')).toBe('Noviembre: USD 24,99');
    expect(point('users').getAttribute('aria-label')).toBe('Semana del 2 de nov: 12 usuarios');
  });

  it('shows the label and exact amount with the mouse, and hides when it leaves', async () => {
    const { point, settle } = await render();
    point('oct').dispatchEvent(new MouseEvent('mouseenter', { clientX: 20, clientY: 40 }));
    await settle();
    expect(tooltip()?.textContent).toContain('Octubre');
    expect(tooltip()?.textContent).toContain('$ 18.500');
    expect(point('oct').getAttribute('aria-describedby')).toBe(tooltip()?.id);

    point('oct').dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('shows on keyboard focus and closes with Escape', async () => {
    const { point, settle } = await render();
    point('nov').focus();
    await settle();
    expect(tooltip()?.textContent).toContain('USD 24,99');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('opens on tap and closes on a tap outside', async () => {
    const { point, settle } = await render();
    point('users').click();
    await settle();
    expect(tooltip()?.textContent).toContain('12 usuarios');

    const outside = document.querySelector('#outside') as HTMLElement;
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('honors "ocultar montos" in the tooltip and in the label', async () => {
    const { point, settle } = await render();
    TestBed.inject(HideAmounts).hidden.set(true);
    await settle();
    expect(point('oct').getAttribute('aria-label')).toBe('Octubre: $ •••••');
    point('oct').focus();
    await settle();
    expect(tooltip()?.textContent).not.toContain('18.500');
    expect(tooltip()?.textContent).toContain('Octubre');
  });
});

@Component({
  imports: [PlInfoTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button id="help" aria-label="Qué es Libre" term="Libre" plInfoTip="Lo que te queda de verdad">
      i
    </button>
    <button id="away">Afuera</button>
  `,
})
class InfoHost {}

describe('plInfoTip', () => {
  afterEach(() => document.querySelector('.cdk-overlay-container')?.replaceChildren());

  it('explains the term on hover, focus and tap, and is linked to the button', async () => {
    const fixture = TestBed.createComponent(InfoHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const help = el.querySelector<HTMLButtonElement>('#help') as HTMLButtonElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    expect(help.getAttribute('type')).toBe('button');

    help.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(tooltip()?.textContent).toContain('Libre');
    expect(tooltip()?.textContent).toContain('Lo que te queda de verdad');
    expect(help.getAttribute('aria-describedby')).toBe(tooltip()?.id);

    help.dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    expect(tooltip()).toBeNull();

    help.click();
    await settle();
    expect(tooltip()?.textContent).toContain('Lo que te queda de verdad');

    el.querySelector<HTMLButtonElement>('#away')?.dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    await settle();
    expect(tooltip()).toBeNull();
  });
});
