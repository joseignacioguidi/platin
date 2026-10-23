import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./landing/palette-page').then((m) => m.PalettePage),
  },
];
