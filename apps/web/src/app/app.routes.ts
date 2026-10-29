import { Route } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/auth.guards';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing-page').then((m) => m.LandingPage),
  },
  {
    path: 'planes',
    title: 'Planes · platin',
    loadComponent: () => import('./features/plans/plans-page').then((m) => m.PlansPage),
  },
  {
    path: 'ingresar',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register-page').then((m) => m.RegisterPage),
  },
  {
    // Rendered in the browser: it refreshes with the cookie the API just set (AUTH-06).
    path: 'auth/listo',
    title: 'Ingresando · platin',
    loadComponent: () => import('./features/auth/auth-done-page').then((m) => m.AuthDonePage),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    loadChildren: () => import('./app-area.routes').then((m) => m.appAreaRoutes),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  { path: '**', redirectTo: '' },
];
