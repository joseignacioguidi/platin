import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { PL_TODAY } from '@platin/web-ui';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideAppIcons } from './core/icons';
import { provideSyncOnStart } from './core/session/sync-on-start';
import { Today } from './core/today';
import { planLimitInterceptor } from './features/plans/plan-limit.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, planLimitInterceptor])),
    provideClientHydration(withEventReplay(), withIncrementalHydration()),
    provideAppIcons(),
    provideSyncOnStart(),
    { provide: PL_TODAY, useFactory: () => inject(Today).date },
  ],
};
