import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { messageForCode } from '../../core/errors';
import { SessionService } from '../../core/session/session.service';
import { AuthDonePage } from './auth-done-page';

describe('AuthDonePage (/auth/listo)', () => {
  async function land(restored: boolean, returnTo?: string): Promise<Router> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { restore: () => Promise.resolve(restored) } },
      ],
    });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AuthDonePage);
    if (returnTo) fixture.componentRef.setInput('returnTo', returnTo);
    await fixture.componentInstance.ngOnInit();
    return router;
  }

  it('refreshes with the cookie and goes on to the page inside the app', async () => {
    const router = await land(true, '/app/tarjetas');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/tarjetas', { replaceUrl: true });
  });

  it('never leaves the app', async () => {
    const router = await land(true, '//evil.example');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app', { replaceUrl: true });
  });

  it('goes back to /ingresar when there is no session', async () => {
    const router = await land(false, '/app');
    expect(router.navigate).toHaveBeenCalledWith(['/ingresar'], {
      queryParams: { error: 'SESSION_INVALID' },
      replaceUrl: true,
    });
  });
});

describe('messageForCode', () => {
  it('explains how to link an email that already has an account', () => {
    expect(messageForCode('ACCOUNT_EXISTS_LINK_REQUIRED')).toBe(
      'Ya tenés una cuenta con ese email. Ingresá con tu contraseña y vinculá Google desde tu perfil.',
    );
  });

  it('has a generic message for unknown codes and nothing without a code', () => {
    expect(messageForCode('ALGO_RARO')).toBe('Algo salió mal. Probá de nuevo.');
    expect(messageForCode(undefined)).toBeNull();
  });
});
