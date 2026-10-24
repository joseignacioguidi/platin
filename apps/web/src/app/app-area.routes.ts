import { Route } from '@angular/router';

/** Routes inside the shell (/app/**). Each feature is lazy loaded. */
export const appAreaRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Inicio · platin',
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'movimientos',
    title: 'Movimientos · platin',
    loadComponent: () =>
      import('./features/placeholder/coming-soon-page').then((m) => m.ComingSoonPage),
    data: { heading: 'Movimientos' },
  },
  {
    path: 'tarjetas',
    title: 'Tarjetas · platin',
    loadComponent: () =>
      import('./features/placeholder/coming-soon-page').then((m) => m.ComingSoonPage),
    data: { heading: 'Tarjetas' },
  },
  {
    path: 'mas',
    title: 'Más · platin',
    loadComponent: () => import('./features/settings/more-page').then((m) => m.MorePage),
  },
  {
    path: 'perfil',
    title: 'Perfil · platin',
    loadComponent: () => import('./features/settings/profile-page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: '' },
];
