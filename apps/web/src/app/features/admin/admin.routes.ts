import { Route } from '@angular/router';

/** Routes of the admin panel (/admin/**), each page lazy loaded. */
export const adminRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Resumen · Administración · platin',
    loadComponent: () => import('./admin-overview-page').then((m) => m.AdminOverviewPage),
  },
  {
    path: 'usuarios',
    title: 'Usuarios · Administración · platin',
    loadComponent: () => import('./admin-users-page').then((m) => m.AdminUsersPage),
  },
  {
    path: 'usuarios/:id',
    title: 'Usuario · Administración · platin',
    loadComponent: () => import('./admin-user-page').then((m) => m.AdminUserPage),
  },
  {
    path: 'configuracion',
    title: 'Configuración · Administración · platin',
    loadComponent: () => import('./admin-settings-page').then((m) => m.AdminSettingsPage),
  },
  {
    path: 'auditoria',
    title: 'Auditoría · Administración · platin',
    loadComponent: () => import('./admin-audit-page').then((m) => m.AdminAuditPage),
  },
  { path: '**', redirectTo: '' },
];
