import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlWink } from './wink';

@Component({
  imports: [PlWink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-wink id="decorative" />
    <pl-wink id="named" label="La cara de platin" [animated]="true" />
  `,
})
class Host {}

describe('pl-wink', () => {
  it('is decorative without a label and an image with one', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const decorative = el.querySelector('#decorative');
    expect(decorative?.getAttribute('aria-hidden')).toBe('true');
    expect(decorative?.getAttribute('role')).toBeNull();
    expect(decorative?.querySelector('svg')?.classList.contains('animated')).toBe(false);

    const named = el.querySelector('#named');
    expect(named?.getAttribute('role')).toBe('img');
    expect(named?.getAttribute('aria-label')).toBe('La cara de platin');
    expect(named?.querySelector('svg')?.classList.contains('animated')).toBe(true);
  });
});
