# 0002 — `vercel.ts` en lugar de `vercel.json`

Fecha: 2026-10-23 · Estado: aceptada

## Contexto

La arquitectura usa `vercel.json` con un rewrite de `/api/:path*` a Render y una transformación que agrega la cabecera `x-origin-secret`. Pero la URL de Render y el secreto no deberían quedar escritos en el repo.

## Decisión

Usar `vercel.ts` (paquete `@vercel/config`), que Vercel ejecuta al hacer el build:

- La URL de destino sale de `API_DIRECT_URL`, que se lee en el build.
- La cabecera usa `deploymentEnv('ORIGIN_SECRET')`, que Vercel resuelve en cada pedido; el valor nunca se escribe en la configuración generada.
- Como las transformaciones de cabeceras solo existen en la forma `routes`, el ruteo completo se declara ahí: primero `/api/*` hacia Render con `cache-control: no-store`, después los archivos estáticos y por último el fallback a `index.html`.

## Consecuencias

- Hay que configurar `API_DIRECT_URL` y `ORIGIN_SECRET` en el proyecto de Vercel (ver README).
- Agrega la dependencia de desarrollo `@vercel/config`.
