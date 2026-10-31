# platin

Tu plata, más clara. App web de finanzas personales: ingresos, gastos, tarjetas con cuotas, compromisos y metas, en pesos y dólares.

- Especificación: [`docs/especificacion.md`](docs/especificacion.md)
- Arquitectura: [`docs/arquitectura.md`](docs/arquitectura.md)
- Plan por fases: [`docs/plan.md`](docs/plan.md)
- Decisiones: [`docs/adr/`](docs/adr)

## Requisitos

- Node 24
- pnpm 10 (`npm i -g pnpm@10`)
- Docker (Postgres local y tests e2e)

## Levantar todo en local

```bash
pnpm install
cp .env.example .env              # los valores por defecto sirven para local
docker compose up -d              # Postgres en localhost:5432
pnpm nx run api:prisma-deploy     # aplica las migraciones
pnpm nx serve api                 # API en http://localhost:3000/api/v1
pnpm nx serve web                 # Web en http://localhost:4200 (proxy de /api a la API)
```

Comandos útiles:

```bash
pnpm nx run-many -t lint typecheck test build   # todo el workspace
pnpm nx affected -t lint typecheck test build   # solo lo afectado
pnpm nx test domain                             # reglas de negocio
pnpm nx test api                                # e2e de la API (usa TEST_DATABASE_URL)
pnpm nx run api:prisma-migrate                  # nueva migración en local
docker build -f apps/api/Dockerfile -t platin-api .
```

Los tests de la API crean la base `platin_test` si no existe y le aplican las migraciones.

## Estructura

| Proyecto | Qué es |
| --- | --- |
| `apps/web` | Angular: landing pública y app en `/app` |
| `apps/api` | NestJS + Prisma: API REST en `/api/v1` |
| `libs/domain` | Reglas de negocio como funciones puras |
| `libs/contracts` | Esquemas Zod y tipos de la API |
| `libs/web-ui` | Componentes base (`pl-`) y tokens de diseño (`src/styles/theme.css`) |

## Deploy

Un push a `main` despliega la web en Vercel y la API en Render. Antes, el CI corre lint, typecheck, tests y build de lo afectado.

### Neon (Postgres)

1. Crear el proyecto y la base `platin`.
2. Copiar dos cadenas de conexión: la **con pooler** (`DATABASE_URL`) y la **directa** (`DIRECT_URL`).

### Render (API)

1. New → Web Service desde el repo de GitHub, runtime **Docker**.
2. Dockerfile path: `apps/api/Dockerfile`. Docker context: la raíz del repo (`.`).
3. Health check path: `/api/v1/health`.
4. Variables de entorno:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon, con pooler |
| `DIRECT_URL` | Neon, directa (la usa `prisma migrate deploy` al arrancar) |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `REFRESH_TOKEN_PEPPER` | `openssl rand -base64 48` |
| `ORIGIN_SECRET` | `openssl rand -hex 32`, el mismo valor que en Vercel. Obligatoria: sin ella la API no arranca en producción |
| `TRUST_PROXY_HOPS` | `4` (la IP del cliente está a 4 entradas desde la derecha de `X-Forwarded-For`: Vercel, Cloudflare y Render agregan las suyas). Obligatoria: sin ella la API no arranca en producción |
| `CLIENT_IP_HEADER` | `x-vercel-proxied-for`: la IP real que Vercel siempre pisa (`x-vercel-forwarded-for` a veces conserva un valor falso). El rate limiting la prefiere porque Vercel reenvía tal cual el `X-Forwarded-For` que manda el cliente |
| `APP_ORIGIN` | URL de Vercel, por ejemplo `https://platin.vercel.app` |
| `RATES_BASE_URL` | `https://dolarapi.com` |

Render define `PORT` solo.

### Vercel (web)

1. Importar el repo de GitHub. Root directory: la raíz del repo. La configuración sale de `vercel.ts`, así que no hace falta tocar los comandos de build.
2. Variables de entorno:

| Variable | Valor |
| --- | --- |
| `API_DIRECT_URL` | URL de Render, por ejemplo `https://platin-api.onrender.com` |
| `ORIGIN_SECRET` | El mismo valor que en Render |

### Probar el deploy

- `https://<app>.vercel.app/` muestra la página de prueba con la paleta.
- `https://<app>.vercel.app/api/v1/health` devuelve `{"status":"ok","database":"ok"}` a través de Vercel.
- `https://<api>.onrender.com/api/v1/<cualquier-otra-ruta>` sin la cabecera devuelve 403: solo se entra por Vercel.
