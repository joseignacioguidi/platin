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
    path: 'reservas/:id',
    title: 'Reserva · platin',
    loadComponent: () =>
      import('./features/accounts/pocket-detail-page').then((m) => m.PocketDetailPage),
  },
  // Before iteration 6 the detail lived under /app/apartados.
  { path: 'apartados/:id', redirectTo: 'reservas/:id' },
  {
    path: 'tarjetas',
    title: 'Tarjetas · platin',
    loadComponent: () => import('./features/cards/cards-page').then((m) => m.CardsPage),
  },
  {
    path: 'tarjetas/compras',
    title: 'Compras · platin',
    loadComponent: () => import('./features/cards/charges-page').then((m) => m.ChargesPage),
  },
  {
    path: 'tarjetas/:id/compras',
    title: 'Compras · platin',
    loadComponent: () => import('./features/cards/charges-page').then((m) => m.ChargesPage),
  },
  {
    path: 'tarjetas/:id',
    title: 'Tarjeta · platin',
    loadComponent: () => import('./features/cards/card-detail-page').then((m) => m.CardDetailPage),
  },
  {
    // COM-05: each tab is a child route of the section.
    path: 'compromisos',
    loadComponent: () =>
      import('./features/commitments/commitments-section').then((m) => m.CommitmentsSection),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Compromisos · platin',
        loadComponent: () =>
          import('./features/commitments/commitments-page').then((m) => m.CommitmentsPage),
      },
      {
        path: 'fijos',
        title: 'Fijos · platin',
        loadComponent: () => import('./features/fixed/fixed-page').then((m) => m.FixedPage),
      },
      {
        path: 'para-confirmar',
        title: 'Para confirmar · platin',
        loadComponent: () => import('./features/pending/pending-page').then((m) => m.PendingPage),
      },
    ],
  },
  {
    // INV-06
    path: 'ahorros',
    loadComponent: () => import('./features/savings/savings-section').then((m) => m.SavingsSection),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Ahorros e inversiones · platin',
        loadComponent: () => import('./features/savings/savings-page').then((m) => m.SavingsPage),
      },
      {
        path: 'inversiones',
        title: 'Inversiones · platin',
        loadComponent: () =>
          import('./features/investments/investments-page').then((m) => m.InvestmentsPage),
      },
    ],
  },
  // NAV-03: the old routes lead to their tab. 'full' so /app/inversiones/actualizar stays.
  { path: 'fijos', pathMatch: 'full', redirectTo: 'compromisos/fijos' },
  { path: 'pendientes', pathMatch: 'full', redirectTo: 'compromisos/para-confirmar' },
  { path: 'inversiones', pathMatch: 'full', redirectTo: 'ahorros/inversiones' },
  {
    path: 'inversiones/actualizar',
    title: 'Actualizar valores · platin',
    loadComponent: () =>
      import('./features/investments/update-values-page').then((m) => m.UpdateValuesPage),
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
    title: 'Perfil y ajustes · platin',
    loadComponent: () => import('./features/settings/profile-page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: '' },
];
