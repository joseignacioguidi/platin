# 0005 — Base del frontend: íconos, prerender y configuración de build

Fecha: 2026-10-24 · Estado: aceptada

## Contexto

La arquitectura nombra `lucide-angular`, pide prerenderizar la landing y el login, y que el front llame directo a Render para despertar el servidor (`API_DIRECT_URL`, una variable del build de Vercel).

## Decisiones

- **`@lucide/angular` en lugar de `lucide-angular`.** El paquete viejo está discontinuado y solo declara soporte hasta Angular 21. El nuevo es el oficial: standalone, con signals y zoneless (`<svg lucideHouse>`). Los íconos que se usan por nombre (los de las categorías) se registran en `core/icons.ts`; así solo se empaquetan esos.
- **Prerender con `outputMode: "static"`.** `/`, `/ingresar` y `/registro` se prerenderizan; el resto se renderiza en el cliente. Angular genera `index.csr.html` para las rutas de cliente, y `vercel.ts` apunta ahí el fallback de `/app/**`.
- **`API_DIRECT_URL` en el build.** El target `web:write-env` escribe `apps/web/src/env.generated.ts` (ignorado por git) a partir de la variable de entorno, y build, serve, test, lint y typecheck dependen de él. Si está vacía, el front despierta el servidor por la misma ruta `/api/v1/health`.
- **`PORT` fuera del `.env`.** Nx carga el `.env` de la raíz en todas las tareas, y el dev server de Angular también tomaba `PORT=3000`. La API ya usa 3000 por defecto y Render define `PORT` por su cuenta.
- **Formularios.** Cada control se valida con el esquema de `libs/contracts` (`zodValidator`), así el formulario y la API aplican las mismas reglas.

## Consecuencias

- Las páginas con formularios cargan Zod en un chunk diferido de unos 88 kB comprimidos. Se revisa en la pasada de rendimiento de la fase 8 (por ejemplo, con `zod/mini`).
