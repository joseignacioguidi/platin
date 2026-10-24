import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API } from '../api';
import { AuthService } from './auth.service';

/** Endpoints that work with the refresh cookie (or nothing) instead of the access token. */
const SESSION_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

function isApi(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith(API);
}

function isSessionEndpoint(req: HttpRequest<unknown>): boolean {
  return SESSION_ENDPOINTS.some((path) => req.url === `${API}${path}`);
}

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Adds the access token to API calls. On a 401 it refreshes once (shared between concurrent
 * requests) and retries; if the refresh fails, it sends the user to /ingresar.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApi(req) || isSessionEndpoint(req)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);

  return next(withToken(req, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((refreshed) => {
          if (!refreshed) {
            void router.navigate(['/ingresar'], {
              queryParams: { volver: router.url },
            });
            return throwError(() => error);
          }
          return next(withToken(req, auth.accessToken()));
        }),
      );
    }),
  );
};
