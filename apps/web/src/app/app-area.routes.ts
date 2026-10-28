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
      import('./features/transactions/movements-page').then((m) => m.MovementsPage),
  },
  {
    path: 'cuentas',
    title: 'Cuentas · platin',
    loadComponent: () => import('./features/accounts/accounts-page').then((m) => m.AccountsPage),
  },
  {
    path: 'cuentas/:id',
    title: 'Cuenta · platin',
    loadComponent: () =>
      import('./features/accounts/account-detail-page').then((m) => m.AccountDetailPage),
  },
  {
    path: 'tarjetas',
    title: 'Tarjetas · platin',
    loadComponent: () => import('./features/cards/cards-page').then((m) => m.CardsPage),
  },
  {
    path: 'tarjetas/:id',
    title: 'Tarjeta · platin',
    loadComponent: () => import('./features/cards/card-detail-page').then((m) => m.CardDetailPage),
  },
  {
    path: 'fijos',
    title: 'Fijos · platin',
    loadComponent: () => import('./features/fixed/fixed-page').then((m) => m.FixedPage),
  },
  {
    path: 'pendientes',
    title: 'Para confirmar · platin',
    loadComponent: () => import('./features/pending/pending-page').then((m) => m.PendingPage),
  },
  {
    path: 'compromisos',
    title: 'Compromisos · platin',
    loadComponent: () =>
      import('./features/commitments/commitments-page').then((m) => m.CommitmentsPage),
  },
  {
    path: 'ahorros',
    title: 'Ahorros · platin',
    loadComponent: () => import('./features/savings/savings-page').then((m) => m.SavingsPage),
  },
  {
    path: 'metas/:id',
    title: 'Meta · platin',
    loadComponent: () =>
      import('./features/savings/goal-detail-page').then((m) => m.GoalDetailPage),
  },
  {
    path: 'categorias',
    title: 'Categorías · platin',
    loadComponent: () =>
      import('./features/categories/categories-page').then((m) => m.CategoriesPage),
  },
  {
    path: 'bienvenida',
    title: 'Bienvenida · platin',
    loadComponent: () => import('./features/onboarding/welcome-page').then((m) => m.WelcomePage),
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
