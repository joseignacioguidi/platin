import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appAreaRoutes } from './app-area.routes';

@Component({ selector: 'pl-stub', imports: [RouterOutlet], template: '<router-outlet />' })
class Stub {}

/** The real route tree, with every lazy screen swapped for a stub (no page code loads). */
function stubbed(routes: Route[]): Route[] {
  return routes.map((route) => {
    const { loadComponent, children, ...rest } = route;
    return {
      ...rest,
      ...(loadComponent ? { component: Stub } : {}),
      ...(children ? { children: stubbed(children) } : {}),
    };
  });
}

describe('app area routes (NAV-03, iteration 10)', () => {
  async function go(url: string): Promise<{ url: string; title: string | undefined }> {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'app', children: stubbed(appAreaRoutes) }])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const router = TestBed.inject(Router);
    let snapshot = router.routerState.snapshot.root;
    while (snapshot.firstChild) snapshot = snapshot.firstChild;
    return { url: router.url, title: snapshot.title };
  }

  it.each([
    ['/app/fijos', '/app/compromisos/fijos'],
    ['/app/pendientes', '/app/compromisos/para-confirmar'],
    ['/app/inversiones', '/app/ahorros/inversiones'],
  ])('%s leads to its tab', async (from, to) => {
    expect((await go(from)).url).toBe(to);
  });

  it('keeps "Actualizar valores" where it was', async () => {
    const result = await go('/app/inversiones/actualizar');
    expect(result.url).toBe('/app/inversiones/actualizar');
    expect(result.title).toBe('Actualizar valores · platin');
  });

  it.each([
    ['/app/compromisos', 'Compromisos · platin'],
    ['/app/compromisos/fijos', 'Fijos · platin'],
    ['/app/compromisos/para-confirmar', 'Para confirmar · platin'],
    ['/app/ahorros', 'Ahorros e inversiones · platin'],
    ['/app/ahorros/inversiones', 'Inversiones · platin'],
    ['/app/perfil', 'Perfil y ajustes · platin'],
  ])('%s opens its screen', async (url, title) => {
    const result = await go(url);
    expect(result.url).toBe(url);
    expect(result.title).toBe(title);
  });

  it('keeps the query of the profile (AUTH-07)', async () => {
    expect((await go('/app/perfil?vinculado=google')).url).toBe('/app/perfil?vinculado=google');
  });
});
