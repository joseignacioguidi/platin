import { isPlatformServer } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from '../session/session.service';
import { AuthService } from './auth.service';

/** /app/**: restores the session (wake + refresh) or sends the user to /ingresar. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  if (await inject(SessionService).restore()) return true;
  return router.createUrlTree(['/ingresar'], { queryParams: { volver: state.url } });
};

/** /ingresar and /registro: if there is already a session in memory, go to the app. */
export const guestGuard: CanActivateFn = () => {
  // Prerendered pages are the same for everyone.
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  return inject(AuthService).isAuthenticated() ? inject(Router).createUrlTree(['/app']) : true;
};

/** /admin/**: only administrators (the API checks again on every request). */
export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  if (!(await inject(SessionService).restore())) return router.createUrlTree(['/ingresar']);
  return auth.user()?.role === 'ADMIN' ? true : router.createUrlTree(['/app']);
};
