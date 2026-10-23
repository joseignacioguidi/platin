# platin

App web de finanzas personales: "Tu plata, más clara."
Ingresos, gastos, tarjetas con cuotas, compromisos futuros, metas de ahorro e inversiones, en pesos y dólares. Uso personal, multiusuario, mobile-first.

## Documentos de referencia

Leé lo que corresponda ANTES de escribir código. Son la fuente de verdad; si algo de este archivo contradice a `docs/`, gana `docs/` y avisame.

- `docs/especificacion.md` — qué hace la app: entidades, casos de uso (códigos AUTH-01, TAR-02, etc.), reglas de negocio, alcance del MVP.
- `docs/arquitectura.md` — cómo se construye: monorepo, esquema de Prisma, módulos, endpoints, auth, cotizaciones, deploy, Docker.
- `docs/plan.md` — fases de implementación y su criterio de terminado.
- `docs/mockups/` — capturas de las pantallas acordadas. La UI debe parecerse a esto.
- `docs/brand/` — íconos SVG de platin.
- `docs/adr/` — decisiones que cambiaron algo de la arquitectura.

## Stack

- Monorepo Nx + pnpm.
- `apps/api`: NestJS + Prisma (Postgres). Validación con Zod (`nestjs-zod`).
- `apps/web`: Angular (standalone, signals, zoneless, control flow nuevo), Tailwind, Angular CDK, Lucide.
- `libs/domain`: reglas de negocio como funciones puras. Sin I/O.
- `libs/contracts`: esquemas Zod y tipos de la API, compartidos por front y back.
- `libs/web-ui`: componentes base de Angular (prefijo `pl-`).
- Tests: Vitest en todo; Supertest para e2e de la API contra Postgres en Docker.
- Deploy: web en Vercel (rewrite de `/api` a Render), API en Render desde su Dockerfile, Postgres en Neon.

## Reglas de dependencias

- `libs/domain` no importa nada del monorepo.
- `libs/contracts` solo importa `libs/domain`.
- `libs/web-ui` solo importa `libs/domain`.
- `apps/api` importa `contracts` y `domain`. `apps/web` importa `web-ui`, `contracts` y `domain`.
- Lo hace cumplir `@nx/enforce-module-boundaries`. No lo desactives.

## Comandos

```bash
pnpm install
docker compose up -d              # Postgres local
pnpm nx serve api                 # API en local
pnpm nx serve web                 # Web en local (proxy de /api a la API)
pnpm nx affected -t lint typecheck test build
pnpm nx test domain               # tests de reglas de negocio
pnpm nx run api:prisma-migrate    # nueva migración en local
```

Antes de dar una tarea por terminada: lint, typecheck, test y build de lo afectado, en verde.

## Dinero, fechas y monedas (no negociable)

- NUNCA `number` ni `Float` para montos.
  - Base: `Decimal @db.Decimal(18, 2)`; cotizaciones `@db.Decimal(18, 6)`.
  - Dominio: clase `Money` de `libs/domain` (decimal.js).
  - JSON: montos como string decimal (`"18500.00"`).
- Redondeo a 2 decimales, mitad hacia arriba. En repartos (cuotas), la diferencia va a la última parte.
- Montos siempre positivos; el signo lo da el tipo (ingreso, gasto, transferencia).
- Fechas de negocio: `YYYY-MM-DD` sin zona horaria (`@db.Date`). Períodos: `YYYY-MM` (en la base, primer día del mes).
- "Hoy" se calcula en `America/Argentina/Buenos_Aires` y se inyecta (`ClockService` en la API, parámetro en `libs/domain`). Nunca `new Date()` dentro de una regla de negocio.
- Cada movimiento congela su cotización (`rateToBase`) y su monto en moneda base al registrarse. El histórico no se recalcula.
- Saldos, totales de resumen y compromisos se CALCULAN; no se guardan.

## Backend

- Un módulo de Nest por dominio. Controladores finos; servicios orquestan; reglas en `libs/domain`.
- Prefijo `/api/v1`, recursos en plural e inglés.
- Request y response validados con los esquemas de `libs/contracts`.
- Errores en formato Problem Details (RFC 9457) con un `code` estable en MAYÚSCULAS (`CARD_STATEMENT_CLOSED`).
- Escrituras de varias filas dentro de una transacción de Prisma.
- Seguridad:
  - El `userId` sale SIEMPRE del token (`@CurrentUser()`), nunca del body ni de la URL.
  - Toda consulta filtra por `userId`. Recurso de otro usuario = 404.
  - Cada módulo tiene un test e2e de aislamiento entre usuarios.
- Configuración solo por variables de entorno (ver `.env.example`). Nada específico de un proveedor en el código.
- Migraciones: siempre con `prisma migrate`, nunca editar una migración ya mergeada.

## Frontend

- Estructura: `core/` (auth, API, sync), `layout/` (shell), `landing/`, `features/<feature>/`.
- Rutas con carga diferida por feature. Landing y login prerenderizados; `/app/**` renderizado en el cliente.
- Estado:
  - Un store por feature (servicio con `signal`/`computed`). Sin NgRx.
  - Lecturas con `httpResource`/`resource`; invalidar lo afectado después de cada escritura.
- Formularios: Reactive Forms tipados, validados con los esquemas de `libs/contracts`.
- `ChangeDetectionStrategy.OnPush` en todos los componentes.
- Estilos: SOLO tokens de Tailwind; nunca colores hex sueltos en componentes.
  - `brand` #00B99A, `brand-strong` #007A65 (texto chico), `ink` #181818, `muted` #6D6D6D.
  - `expense` #FE8363, `pending` #F9C558, `transfer` #0590CB, `card` #8B7FFF, `savings` #7DE2F2.
  - Coral, celeste y rosa como acentos decorativos solo en la landing.
- Tipografías: Uncut Sans (interfaz) y JetBrains Mono (montos y fechas, `tabular-nums`).
- Montos siempre con `pl-money`, que respeta el modo "ocultar montos".
- Accesibilidad:
  - `<button>` y `<a>` reales, foco visible, `aria-label` en botones de ícono.
  - Áreas táctiles de 44 px como mínimo y contraste AA.
- Textos de la interfaz en español rioplatense neutro ("Ingresá", "Cargá"), en un archivo de textos por feature.

## Convenciones

- Código, nombres, commits y comentarios en inglés. UI y documentación en español.
- TypeScript `strict`. Nada de `any` sin un comentario que lo justifique.
- Conventional Commits: `feat(cards): split installments into statements`.
- Una rama por fase o tarea (`feat/fase-4-tarjetas`) y PR a `main`.
- Tests:
  - Toda regla de negocio nueva va con tests en `libs/domain`.
  - Todo endpoint nuevo va con un test e2e.
  - Los ejemplos numéricos de la especificación son tests literales.

## Cómo trabajar conmigo

- Antes de implementar, proponé un plan corto (pasos, archivos, comandos) y esperá mi OK.
- Si una regla de la especificación es ambigua o falta, preguntá; no la inventes.
- No agregues dependencias nuevas sin mencionarlo y explicar por qué.
- No cambies el esquema de la base, las reglas de dependencias ni este archivo sin decírmelo.
- Si tomás una decisión que se aparta de `docs/arquitectura.md`, registrala en `docs/adr/NNNN-titulo.md` (contexto, decisión, consecuencias).
- Al terminar: resumen de lo hecho, cómo probarlo y qué quedó pendiente.
