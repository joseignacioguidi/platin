import { RenderMode, ServerRoute } from '@angular/ssr';

/** Landing and auth pages are prerendered at build time; the app renders in the browser. */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'ingresar', renderMode: RenderMode.Prerender },
  { path: 'registro', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
