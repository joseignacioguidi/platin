import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  computed,
  inject,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { CARD_CURRENCIES } from '@platin/domain';
import { PL_ENABLED_CURRENCIES, PL_TODAY } from '@platin/web-ui';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { provideAppIcons } from './core/icons';
import { provideSyncOnStart } from './core/session/sync-on-start';
import { Today } from './core/today';
import { provideCategoryCreator } from './features/categories/category-creator';
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
    provideCategoryCreator(),
    { provide: PL_TODAY, useFactory: () => inject(Today).date },
    {
      provide: PL_ENABLED_CURRENCIES,
      useFactory: () => {
        const auth = inject(AuthService);
        return computed(() => auth.user()?.currencies ?? CARD_CURRENCIES);
      },
    },
  ],
};
