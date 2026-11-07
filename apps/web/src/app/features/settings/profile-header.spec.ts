import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { User } from '@platin/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileHeader } from './profile-header';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ana@example.com',
  name: 'Ana Pérez',
  baseCurrency: 'ARS',
  valuationRate: 'MEP',
  role: 'USER',
  currencies: ['ARS', 'USD'],
  preferences: {},
} as unknown as User;

describe('ProfileHeader (AUTH-10)', () => {
  function setup() {
    const current = signal<User | null>(user);
    const updateProfile = vi.fn(async (changes: Partial<User>) => {
      current.update((u) => (u ? { ...u, ...changes } : u));
      return current() as User;
    });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: current, updateProfile } }],
    });
    const fixture = TestBed.createComponent(ProfileHeader);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const edit = async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Editar nombre"]')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const input = host.querySelector<HTMLInputElement>('#profile-name');
      if (!input) throw new Error('no name field');
      return input;
    };
    const submit = () => host.querySelector('form')?.dispatchEvent(new Event('submit'));
    return { fixture, host, updateProfile, edit, submit };
  }

  it('shows the name and the email as text, with initials', () => {
    const { host } = setup();
    expect(host.textContent).toContain('Ana Pérez');
    expect(host.textContent).toContain('ana@example.com');
    expect(host.textContent).toContain('AP');
    expect(host.querySelector('input')).toBeNull();
  });

  it('the pencil turns the name into a field; Enter saves it', async () => {
    const { fixture, host, updateProfile, edit, submit } = setup();
    const input = await edit();
    expect(input.value).toBe('Ana Pérez');
    input.value = '  Ana María ';
    input.dispatchEvent(new Event('input'));
    // Enter in a one-field form submits it.
    submit();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(updateProfile).toHaveBeenCalledWith({ name: 'Ana María' });
    expect(host.querySelector('#profile-name')).toBeNull();
    expect(host.textContent).toContain('Ana María');
  });

  it('Escape cancels without saving', async () => {
    const { fixture, host, updateProfile, edit } = setup();
    const input = await edit();
    input.value = 'Otra';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(host.querySelector('#profile-name')).toBeNull();
    expect(host.textContent).toContain('Ana Pérez');
  });

  it('an empty name saves as no name', async () => {
    const { fixture, updateProfile, edit, submit } = setup();
    const input = await edit();
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    submit();
    await fixture.whenStable();
    expect(updateProfile).toHaveBeenCalledWith({ name: null });
  });
});
