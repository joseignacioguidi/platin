# 0001 — Prisma 7 en CommonJS y workspace Nx integrado

Fecha: 2026-10-23 · Estado: aceptada

## Contexto

La arquitectura pide Prisma 7 y advierte que "exige ESM", con Prisma 6 como plan B si Nest en ESM traía fricción. Además, `create-nx-workspace` 24 genera por defecto un workspace con *project references* de TypeScript y workspaces de pnpm, que el plugin de Angular no soporta.

## Decisión

- **Prisma 7.10.1** con el generador `prisma-client`, `moduleFormat = "cjs"`, salida en `apps/api/src/generated/prisma` (ignorada por git) y el adaptador `@prisma/adapter-pg`. La API se compila con webpack a CommonJS, como genera `@nx/nest`. No hace falta ESM ni bajar a Prisma 6.
- `prisma.config.ts` lee `DIRECT_URL` de forma opcional, para que `prisma generate` corra sin base (CI, Docker).
- **Workspace Nx integrado**: alias en `tsconfig.base.json` (`@platin/domain`, `@platin/contracts`, `@platin/web-ui`) y un solo `package.json` en la raíz.
- `apps/api/package.json` declara a mano `@prisma/client`, `prisma` y `dotenv`. Nx no los detecta solo: el cliente se genera en una carpeta ignorada y el CLI se usa para `migrate deploy` al arrancar el contenedor.
- NestJS queda en la línea 11, la que instala `@nx/nest` 24.

## Consecuencias

- `build`, `typecheck`, `lint` y `test` de la API dependen del target `prisma-generate`.
- La imagen de la API pesa alrededor de 1,3 GB porque el CLI de Prisma 7 incluye Studio y PGlite. Funciona en Render; si molesta, se puede correr `migrate deploy` desde una imagen aparte.
