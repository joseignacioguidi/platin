import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injector } from '@angular/core';
import { catchError, throwError } from 'rxjs';

const PLAN_CODES = ['PLAN_LIMIT_REACHED', 'FEATURE_NOT_IN_PLAN'];

/**
 * When the API says a plan limit was reached (or a feature is not included), opens the sheet that
 * explains it and offers another plan. The error still reaches the caller. Everything about the
 * sheet (CDK dialog, schemas) is loaded on demand, so this never weighs on the initial bundle.
 */
export const planLimitInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    catchError((error: unknown) => {
      const code = (error as HttpErrorResponse | null)?.error?.code;
      if (error instanceof HttpErrorResponse && error.status === 403 && PLAN_CODES.includes(code)) {
        void import('./plan-sheet').then(({ openPlanSheetFor }) =>
          openPlanSheetFor(injector, error),
        );
      }
      return throwError(() => error);
    }),
  );
};
