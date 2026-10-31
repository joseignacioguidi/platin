# platin — Arquitectura

Oct 23, 2026 · @Jose

Cómo se construye platin ("Tu plata, más clara."): las decisiones técnicas que implementan la [especificación funcional](https://claude.ai/artifact/QfQnXa1fhMndVJKuFPGbPY) y los mockups acordados.

## Resumen de decisiones

TypeScript de punta a punta en un monorepo Nx: Angular en Vercel, NestJS en Render y Postgres en Neon, con la lógica de dinero y los contratos de la API compartidos entre front y back.

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Monorepo | Nx + pnpm | Soporte nativo de Angular y Nest; límites entre librerías verificados por lint |
| Backend | NestJS con módulos por dominio | Estructura predecible para Claude Code |
| ORM | Prisma con migraciones versionadas | Esquema legible y migraciones revisables |
| Contratos | Esquemas Zod en una librería compartida | Una sola validación para el formulario y para la API |
| Lógica de dominio | Funciones puras en `libs/domain` | Cuotas, ciclos de tarjeta y metas testeables sin base de datos |
| Dinero | `numeric` en la base, string en el JSON, decimal.js en el código | Sin errores de redondeo de `float` |
| Frontend | Angular standalone, signals, control flow nuevo | La forma actual de escribir Angular |
| Estilos | Tailwind con los tokens de la paleta + Angular CDK | Identidad propia sin pelear con una librería de componentes |
| Íconos | Lucide | Mismo trazo redondeado que los mockups |
| Landing | Rutas públicas prerenderizadas por la misma app | Un solo deploy y una sola identidad |
| Auth | JWT de acceso en memoria + refresh token en cookie httpOnly | Sesión persistente sin exponer tokens a JavaScript |
| Origen único | Vercel reenvía `/api/*` a Render | La cookie queda en el mismo dominio que la app |
| Fijos | Se generan al abrir la app, de forma idempotente | El backend gratuito se duerme y no se puede depender de un cron |
| Idioma | Código en inglés, interfaz y documentación en español | Convención estándar; la UI le habla al usuario |

## Monorepo

Dos apps y tres librerías. Las reglas de importación se hacen cumplir con tags de Nx y la regla de lint `@nx/enforce-module-boundaries`, así que un import prohibido rompe el CI.

_Diagrama: apps/web importa libs/web-ui, libs/contracts y libs/domain; apps/api importa libs/contracts y libs/domain; libs/contracts y libs/web-ui solo importan libs/domain; libs/domain no importa nada del monorepo._

`apps/web` también importa `libs/domain` directamente (por ejemplo, para previsualizar el reparto de cuotas en el formulario). `libs/web-ui` solo puede importar `libs/domain` para formatear montos.

```
platin/
├── apps/
│   ├── web/            # Angular: landing pública + app en /app
│   └── api/            # NestJS: API REST en /api/v1
│       └── prisma/     # schema.prisma, migraciones, seed
├── libs/
│   ├── domain/         # enums, Money, reglas de negocio (funciones puras)
│   ├── contracts/      # esquemas Zod + tipos inferidos de la API
│   └── web-ui/         # componentes base de Angular
├── docs/               # especificación, arquitectura, plan, ADRs
├── CLAUDE.md
└── nx.json, pnpm-workspace.yaml, package.json
```

| Proyecto | Tags de Nx | Puede importar |
| --- | --- | --- |
| apps/web | `scope:web`, `type:app` | web-ui, contracts, domain |
| apps/api | `scope:api`, `type:app` | contracts, domain |
| libs/web-ui | `scope:web`, `type:ui` | domain |
| libs/contracts | `scope:shared`, `type:contracts` | domain |
| libs/domain | `scope:shared`, `type:domain` | nada del monorepo |

## Modelo de datos

El esquema tiene 19 tablas (iteración 2: cuentas con apartados); toda tabla de primer nivel lleva `userId` y sus índices empiezan por él; las tablas hijas (cuotas, valuaciones, montos de fijos) se acceden siempre a través de su padre. Los saldos, totales de resumen y compromisos no se guardan: se calculan.

Reglas del esquema:

- Montos `Decimal @db.Decimal(18, 2)`, cotizaciones `Decimal @db.Decimal(18, 6)`. Nunca `Float`.
- Fechas sin hora como `@db.Date`. Un "período" es el primer día del mes (`2026-10-01`).
- Montos siempre positivos; el signo lo da el tipo (ingreso, gasto, transferencia).
- Borrado lógico (`archivedAt`) para cuentas, tarjetas, categorías y posiciones: el histórico nunca pierde referencias.
- Prisma 7: generador `prisma-client` con `output` explícito, adaptador `@prisma/adapter-pg` y `prisma.config.ts` en `apps/api` ([guía de migración](https://www.prisma.io/docs/v6/orm/more/upgrades/to-v7)).

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"   // ADR 0001
}

datasource db {
  provider = "postgresql"
}

// ---------- Enums ----------
enum Currency        { ARS USD }
enum RateType        { OFICIAL MEP BLUE }
enum AccountKind     { BANK WALLET CASH BROKER }
enum PocketKind      { AVAILABLE SAVINGS INVESTMENT }
enum InstrumentType  { CEDEAR STOCK MUTUAL_FUND TERM_DEPOSIT CRYPTO OTHER }  // MUTUAL_FUND incluye Superfondos
enum CategoryKind    { INCOME EXPENSE }
enum TxType          { INCOME EXPENSE ADJUSTMENT YIELD }
enum TxStatus        { PENDING CONFIRMED }
enum TxOrigin        { MANUAL FIXED ADJUSTMENT VALUATION }
enum StatementStatus { OPEN CLOSED PARTIALLY_PAID PAID }
enum FixedKind       { INCOME EXPENSE }
enum GoalStatus      { ACTIVE ACHIEVED CANCELLED }

// ---------- Usuario y sesión ----------
model User {
  id            String   @id @default(uuid()) @db.Uuid
  email         String   @unique
  passwordHash  String
  name          String?
  baseCurrency  Currency @default(ARS)
  valuationRate RateType @default(MEP)
  lastSyncedAt  DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  tokenHash String    @unique
  family    String    @db.Uuid
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  @@index([userId])
  @@index([family])
}

// ---------- Cuentas y apartados ----------
// La institución o el lugar: Mercado Pago, Santander, efectivo, un broker.
model Account {
  id         String      @id @default(uuid()) @db.Uuid
  userId     String      @db.Uuid
  name       String
  kind       AccountKind
  color      String?     // nombre de token de diseño
  sortOrder  Int         @default(0)
  archivedAt DateTime?
  createdAt  DateTime    @default(now())
  @@unique([userId, name])
  @@index([userId])
}

// Plata separada dentro de una cuenta, con una sola moneda.
model Pocket {
  id                String          @id @default(uuid()) @db.Uuid
  userId            String          @db.Uuid    // denormalizado para filtrar sin join
  accountId         String          @db.Uuid
  name              String          // "Disponible", "Auto", "CEDEARs"
  kind              PocketKind
  currency          Currency
  instrument        InstrumentType? // solo si kind = INVESTMENT (check constraint)
  initialBalance    Decimal         @default(0) @db.Decimal(18, 2)
  includeInNetWorth Boolean         @default(true)
  sortOrder         Int             @default(0)
  archivedAt        DateTime?
  createdAt         DateTime        @default(now())
  @@unique([accountId, name, currency])
  @@index([userId])
}

// Valor de un apartado de inversión cargado a mano; genera un movimiento YIELD.
model PocketValuation {
  id            String   @id @default(uuid()) @db.Uuid
  pocketId      String   @db.Uuid
  date          DateTime @db.Date
  value         Decimal  @db.Decimal(18, 2)
  transactionId String?  @unique @db.Uuid  // el YIELD que generó (null si la diferencia fue 0)
  createdAt     DateTime @default(now())
  @@unique([pocketId, date])
}

model Category {
  id         String       @id @default(uuid()) @db.Uuid
  userId     String       @db.Uuid
  name       String
  kind       CategoryKind
  icon       String       // nombre de ícono de Lucide
  color      String       // nombre de token de diseño
  parentId   String?      @db.Uuid
  systemKey  String?      // "ADJUSTMENT" | "YIELD": no editable ni archivable
  archivedAt DateTime?
  @@unique([userId, kind, name])
  @@unique([userId, systemKey])
}

// ---------- Movimientos y transferencias ----------
model Transaction {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @db.Uuid
  pocketId    String    @db.Uuid
  categoryId  String?   @db.Uuid
  type        TxType
  status      TxStatus  @default(CONFIRMED)
  origin      TxOrigin  @default(MANUAL)
  amount      Decimal   @db.Decimal(18, 2)  // con signo solo para ADJUSTMENT y YIELD (ADR 0004)
  currency    Currency                       // = moneda del apartado
  rateToBase  Decimal   @db.Decimal(18, 6)
  baseAmount  Decimal   @db.Decimal(18, 2)
  date        DateTime  @db.Date
  description String?
  fixedId     String?   @db.Uuid
  fixedPeriod DateTime? @db.Date
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([fixedId, fixedPeriod])
  @@index([userId, date])
  @@index([pocketId, date])
}

// Mueve plata entre apartados (apartar, invertir, rescatar, entre cuentas, comprar
// dólares) o paga un resumen: exactamente un destino (check constraint en SQL).
model Transfer {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  fromPocketId String   @db.Uuid
  toPocketId   String?  @db.Uuid
  statementId  String?  @db.Uuid
  amountOut    Decimal  @db.Decimal(18, 2)  // moneda del apartado origen
  amountIn     Decimal  @db.Decimal(18, 2)  // moneda del destino
  currencyIn   Currency
  date         DateTime @db.Date
  description  String?
  createdAt    DateTime @default(now())
  @@index([userId, date])
  @@index([fromPocketId])
  @@index([toPocketId])
}

// ---------- Tarjetas ----------
model CreditCard {
  id                     String    @id @default(uuid()) @db.Uuid
  userId                 String    @db.Uuid
  name                   String
  issuer                 String?
  last4                  String?   @db.Char(4)
  creditLimit            Decimal?  @db.Decimal(18, 2)
  closingDay             Int
  dueDay                 Int
  defaultPaymentPocketId String?   @db.Uuid
  archivedAt             DateTime?
  createdAt              DateTime  @default(now())
  @@index([userId])
}

// CardStatement, CardCharge, Installment y StatementAdjustment: sin cambios.

// ---------- Fijos ----------
model FixedItem {
  id                  String    @id @default(uuid()) @db.Uuid
  userId              String    @db.Uuid
  kind                FixedKind
  name                String
  categoryId          String    @db.Uuid
  pocketId            String?   @db.Uuid   // uno de los dos (check constraint)
  cardId              String?   @db.Uuid
  currency            Currency
  intervalMonths      Int       @default(1)
  dayOfMonth          Int
  startPeriod         DateTime  @db.Date
  endPeriod           DateTime? @db.Date
  pausedAt            DateTime?
  lastGeneratedPeriod DateTime? @db.Date
  @@index([userId])
}

// FixedAmount: sin cambios.

// ---------- Metas ----------
model Goal {
  id           String     @id @default(uuid()) @db.Uuid
  userId       String     @db.Uuid
  name         String
  targetAmount Decimal    @db.Decimal(18, 2)
  currency     Currency
  targetPeriod DateTime   @db.Date
  status       GoalStatus @default(ACTIVE)
  createdAt    DateTime   @default(now())
  @@index([userId])
}

// Los apartados que miden la meta. GoalContribution se elimina: para repartir
// plata entre metas se crea un apartado por meta.
model GoalPocket {
  goalId   String @db.Uuid
  pocketId String @db.Uuid
  @@id([goalId, pocketId])
}

// ExchangeRate: sin cambios. Budget (segunda tanda): sin cambios.
```

Las relaciones (`@relation`) se omiten arriba para que el esquema se lea de un vistazo; en el archivo real cada `xxxId` lleva su relación con `onDelete: Restrict`, salvo `Installment`, `StatementAdjustment`, `FixedAmount`, `GoalPocket` y `PocketValuation`, que se borran en cascada con su padre.

Saldo de un apartado = saldo inicial + ingresos confirmados − gastos confirmados ± ajustes ± rendimientos − transferencias que salen + transferencias que entran. El saldo de una cuenta es la suma de sus apartados por moneda. Se calcula con una consulta agregada por apartado; si con el tiempo se vuelve lenta, se agrega una tabla de saldos materializados.

### Reinicio de la base (iteración 2)

No se migran los datos del MVP. Se borran las migraciones de `apps/api/prisma/migrations`, se genera una única migración inicial con el esquema nuevo (incluidas las check constraints de `Transfer`, `Pocket` y `FixedItem` escritas en SQL) y se resetea la base de Neon. Al registrarse, un usuario recibe las categorías sugeridas, las de sistema (Ajustes y Rendimientos) y una cuenta "Efectivo" con su apartado "Disponible" en pesos.

## Backend

Un módulo de Nest por dominio; los controladores son finos, los servicios orquestan y las reglas viven en `libs/domain`.

### Módulos

| Módulo | Responsabilidad | Usa de `libs/domain` |
| --- | --- | --- |
| `auth` | Registro, login, refresh, logout | — |
| `users` | Perfil y preferencias | — |
| `accounts` | Cuentas y sus apartados: CRUD, saldos, ajuste de saldo, archivar | saldo de apartado y totales por moneda |
| `categories` | CRUD, archivar, fusionar, categorías sugeridas y de sistema | — |
| `transactions` | Ingresos, gastos, pendientes, confirmación en lote | conversión a moneda base |
| `transfers` | Transferencias entre apartados: apartar, invertir, rescatar, entre cuentas, compra de dólares | cotización implícita |
| `investments` | Apartados de inversión: valuaciones, rendimientos y resumen | rendimiento por valuación |
| `cards` | Tarjetas, resúmenes, consumos (alta, edición y borrado), cuotas, pagos, cierre | ciclo de tarjeta, reparto de cuotas |
| `fixed` | Fijos y generación de pendientes | períodos que corresponden |
| `commitments` | Línea de tiempo de compromisos (solo lectura) | compromisos por mes |
| `budgets` | Presupuestos y consumo del mes | — |
| `goals` | Metas y apartados vinculados, simulación | cálculo de metas |
| `rates` | Cotizaciones: lectura, caché y descarga | — |
| `dashboard` | Agrega "libre este mes", próximos 30 días y alertas | varias |
| `sync` | Al abrir la app: genera pendientes de fijos y resúmenes faltantes | — |
| `prisma` | Cliente de Prisma compartido (global) | — |

### Convenciones de API

- Prefijo `/api/v1`; recursos en plural y en inglés (`/transactions`, `/cards/:id/statements`).
- Request y response validados con los esquemas Zod de `libs/contracts` (`nestjs-zod`); el mismo esquema genera la documentación OpenAPI.
- Montos como string decimal (`"18500.00"`), fechas como `YYYY-MM-DD`, períodos como `YYYY-MM`.
- Listados con paginación por cursor (`?cursor=&limit=`) y filtros por query string.
- Errores en formato Problem Details (RFC 9457): `{ type, title, status, detail, errors[] }`, con un `code` estable para la UI (`CARD_STATEMENT_CLOSED`, `VALIDATION_FAILED`, etc.).
- Escrituras que crean varias filas (consumo con cuotas, pago de resumen, sync) dentro de una transacción de base de datos.

### Endpoints principales

| Método y ruta | Caso de uso |
| --- | --- |
| `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | AUTH-01, 02 |
| `POST /sync` | Genera pendientes y resúmenes; se llama al abrir la app |
| `GET /dashboard?period=` | DAS-01 |
| `GET/POST /accounts`, `PATCH /accounts/:id` | CTA-01, 03 (cada cuenta trae sus apartados con saldo) |
| `POST /accounts/:id/pockets`, `PATCH /pockets/:id` | CTA-02, 07 |
| `GET /pockets/:id`, `GET /pockets/:id/transactions` | CTA-04 |
| `POST /pockets/:id/adjust` | CTA-06 |
| `GET/POST /transactions`, `PATCH/DELETE /transactions/:id` | MOV-01, 03, 04 |
| `POST /transactions/confirm` | MOV-05 (lote) |
| `POST /transfers` (con `intent`: `SAVE`, `INVEST`, `REDEEM`, `MOVE`) | MOV-02, CTA-05, INV-02 |
| `GET/POST /categories`, `PATCH /categories/:id`, `POST /categories/:id/merge` | CAT-01 a 05 |
| `GET /cards/:id/statements?from=&to=` | TAR-04 |
| `POST /cards/:id/charges`, `PATCH/DELETE /charges/:id` | TAR-02, 03, 11 |
| `GET /cards/:id/installments?active=true` | TAR-05 |
| `POST /statements/:id/close`, `POST /statements/:id/payments` | TAR-07, 08 |
| `GET/POST /fixed`, `POST /fixed/:id/amounts` | FIJ-01, 02 |
| `GET /commitments?months=12` | COM-01, 02 |
| `GET /investments` | INV-05 |
| `POST /investments/valuations` (lote), `DELETE /valuations/:id` | INV-03, 04 |
| `GET/POST /goals`, `GET /goals/:id/projection?monthly=` | MET-01 a 04 |
| `GET /rates/latest` | Cotización vigente por tipo |
| `GET /health` | Despertar el servidor y monitoreo |

### Lógica de dominio

Todo lo que tiene una regla de la especificación es una función pura en `libs/domain`, con tests unitarios y sin acceso a base de datos ni a la fecha del sistema (el "hoy" se pasa como parámetro). Las principales:

- `statementPeriodFor(card, purchaseDate, overrides)`: a qué resumen cae una compra.
- `buildStatementDates(card, period)`: cierre y vencimiento por defecto de un período.
- `splitInstallments(total, count, startAt)`: montos de cada cuota, con el redondeo en la última.
- `duePeriods(fixed, from, to)`: períodos que un fijo debe generar.
- `commitmentsByMonth(input, months)`: compromisos por mes y moneda.
- `goalProjection(goal, accumulated, today, monthly?)`: faltante, aporte mensual, ritmo y fecha estimada.
- `pocketBalance(initial, transactions, transfers, at?)` y `accountTotals(pockets)`: saldo de un apartado a una fecha y totales de la cuenta por moneda.
- `yieldFromValuation(balanceAt, value)`: rendimiento que genera una valuación.
- `investmentSummary(pocket, transfers, yields)`: invertido neto, valor actual, rendimiento acumulado y del último período.
- `Money`: suma, resta, conversión y redondeo sobre decimal.js; nunca `number` para montos.

## Frontend

Angular en su última versión estable al iniciar (hoy, la [22](https://www.gitclear.com/open_repos/angular/angular/release/v22.0.6)), sin NgModules, con signals para el estado y organizado por feature. La landing y la app son la misma aplicación con dos modos de renderizado.

### Rutas y renderizado

| Ruta | Contenido | Renderizado |
| --- | --- | --- |
| `/` | Landing | Prerenderizada (estática) |
| `/ingresar`, `/registro` | Login y registro | Prerenderizadas |
| `/app` | Inicio ("Libre este mes") | Cliente, protegida por guard |
| `/app/movimientos` | Lista, filtros y búsqueda | Cliente |
| `/app/tarjetas`, `/app/tarjetas/:id` | Tarjetas, resumen, cuotas | Cliente |
| `/app/ahorros`, `/app/metas/:id` | Ahorros y detalle de meta | Cliente |
| `/app/inversiones` | Apartados de inversión, rendimientos y "Actualizar valores" (`/app/inversiones/actualizar`) | Cliente |
| `/app/compromisos`, `/app/fijos`, `/app/cuentas`, `/app/cuentas/:id`, `/app/apartados/:id`, `/app/categorias`, `/app/perfil` | Resto de las pantallas | Cliente |

La carga rápida no es una ruta: es una hoja inferior global que se abre desde el botón + o con Ctrl+K.

### Estructura

```
apps/web/src/app/
├── core/          # auth (servicio, guard, interceptor), cliente de API, sync, wake-up
├── layout/        # shell de la app: barra inferior, barra lateral, botón +
├── landing/       # páginas públicas
└── features/
    ├── dashboard/
    ├── quick-entry/     # carga rápida
    ├── transactions/
    ├── cards/
    ├── fixed/
    ├── commitments/
    ├── savings/         # ahorros + metas
    ├── investments/
    ├── budgets/
    └── settings/
```

Cada feature tiene sus rutas (carga diferida), sus componentes de página y un store.

### Estado y datos

- Un store por feature: un servicio con `signal`/`computed` y métodos que llaman a la API. Sin NgRx; no hace falta para una app de este tamaño.
- Lecturas con `httpResource` o `resource` cuando la pantalla depende de parámetros (mes, tarjeta).
- Después de una escritura se invalidan los recursos afectados (por ejemplo, un consumo nuevo recarga la tarjeta y el inicio).
- Formularios con Reactive Forms tipados, validados con los mismos esquemas Zod de `libs/contracts`.
- Change detection sin zone.js (zoneless) y `ChangeDetectionStrategy.OnPush` en todos los componentes.

### Diseño

- Tailwind con los colores de Hecho como tokens: `brand` (#00B99A), `ink` (#181818), `expense` (#FE8363), `pending` (#F9C558), `transfer` (#0590CB), `card` (#8B7FFF), `savings` (#7DE2F2), `muted` (#6D6D6D), más las variantes oscuras para texto chico (`brand-strong` #007A65).
- Modo oscuro con la clase `dark` y tokens redefinidos.
- Tipografías autoalojadas: Uncut Sans para la interfaz y JetBrains Mono para montos y fechas, con `font-variant-numeric: tabular-nums`.
- Íconos con `lucide-angular`.
- Angular CDK para overlay, diálogo, hoja inferior, foco y accesibilidad.
- Manifest web con el ícono de platin, para agregar la app a la pantalla de inicio del celular (sin modo offline).

### Componentes base (`libs/web-ui`)

| Componente | Uso |
| --- | --- |
| `pl-button` | Primario (tinta), secundario, fantasma, ícono |
| `pl-chip` | Categorías y filtros, con estado seleccionado |
| `pl-money` | Muestra un monto con moneda, signo, color y modo "ocultar montos" |
| `pl-amount-keypad` | Teclado numérico de la carga rápida |
| `pl-bottom-sheet` | Hoja inferior sobre el CDK |
| `pl-segmented` | Selector tipo Gasto / Ingreso / Transferencia |
| `pl-select` | Reemplaza a todo `<select>`: combobox con búsqueda, ícono y color por opción, texto secundario, grupos, teclado y ARIA de combobox; overlay del CDK en escritorio y hoja inferior en celular; integra con Reactive Forms (`ControlValueAccessor`) |
| `pl-pocket-select` | `pl-select` preconfigurado: apartados agrupados por cuenta, con moneda y saldo |
| `pl-category-select` | `pl-select` preconfigurado: categorías con ícono y color, filtradas por tipo |
| `pl-date-field` | Reemplaza a todo `<input type="date">`: calendario propio en español, atajos Hoy y Ayer, límites mínimo y máximo, teclado; `ControlValueAccessor` con `LocalDate` |
| `pl-icon-picker`, `pl-color-picker` | Elección de ícono (lista curada de Lucide) y color (tokens de la paleta) para categorías y cuentas |
| `pl-progress` | Barra y anillo de progreso |
| `pl-stacked-bar` | Barra de reparto (gastado, comprometido, libre) |
| `pl-list-item` | Fila de movimiento, compromiso o apartado |
| `pl-empty-state` | Pantalla vacía con guía de qué cargar |

## Auth y seguridad

Auth propio con dos tokens: un JWT de acceso corto que vive en memoria y un refresh token largo en una cookie httpOnly, rotado en cada uso. Como Vercel reenvía `/api/*` a Render, la cookie es del mismo dominio que la app y no depende de cookies de terceros.

### Tokens

| Token | Dónde vive | Duración | Detalle |
| --- | --- | --- | --- |
| Acceso (JWT) | Memoria del front (signal) | 15 minutos | Va en `Authorization: Bearer`; contiene solo `sub` (userId) |
| Refresh | Cookie `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/v1/auth` | 30 días | Opaco; en la base se guarda solo su hash |

- **Rotación**: cada `POST /auth/refresh` revoca el token usado y emite uno nuevo de la misma familia. Si llega un token ya revocado, se revoca toda la familia (posible robo) y hay que volver a ingresar.
- **Al abrir la app**: el front llama a `/auth/refresh`; si funciona, la sesión sigue sin pedir contraseña.
- **Interceptor HTTP**: ante un 401, intenta un refresh una sola vez y reintenta el pedido; si falla, manda a `/ingresar`.
- **Contraseñas**: hash con argon2id; mínimo 10 caracteres.
- **Logout**: revoca la familia y borra la cookie.

### Aislamiento por usuario

- Un guard global exige JWT en todo salvo `/auth/*` y `/health`.
- El `userId` sale siempre del token (decorador `@CurrentUser()`), nunca del body ni de la URL.
- Todo servicio filtra por `userId` en cada consulta; acceder a un recurso de otro usuario devuelve 404, no 403, para no revelar que existe.
- Un test e2e por módulo verifica que el usuario B no puede leer ni modificar datos del usuario A.

### Ingreso con proveedores externos

Cada proveedor es una implementación de una misma interfaz, y el flujo OAuth vive entero en el backend: termina emitiendo la misma sesión (refresh token en cookie) que el login con contraseña, así que el resto de la app no cambia. Por ahora se implementa Google; Facebook y Apple se suman agregando su clase y sus variables de entorno.

```prisma
enum AuthProvider { GOOGLE FACEBOOK APPLE }

// En User: passwordHash pasa a ser opcional (String?).

model AuthIdentity {
  id             String       @id @default(uuid()) @db.Uuid
  userId         String       @db.Uuid
  provider       AuthProvider
  providerUserId String       // "sub" del id_token: estable aunque cambie el email
  email          String?
  createdAt      DateTime     @default(now())
  lastUsedAt     DateTime?
  @@unique([provider, providerUserId])
  @@unique([userId, provider])        // un vínculo por proveedor y usuario
}
```

Piezas del backend (módulo `auth`):

- `OAuthProvider`: `buildAuthorizationUrl({ state, codeChallenge, nonce, redirectUri })` y `exchangeCode({ code, codeVerifier, nonce, redirectUri })`, que devuelve `{ providerUserId, email, emailVerified, name }`.
- `GoogleProvider` con la librería `openid-client`: descubrimiento OIDC, PKCE y verificación del `id_token` (firma, audiencia, emisor y `nonce`). Scopes: `openid email profile`, los básicos que Google no obliga a verificar ([Google](https://support.google.com/cloud/answer/15549945?hl=es)).
- `OAuthProviderRegistry`: un proveedor está habilitado solo si sus variables de entorno están definidas. `GET /auth/providers` (público) devuelve los habilitados y el front dibuja los botones a partir de esa lista.

Flujo:

1. El botón "Continuar con Google" navega (navegación completa, no un pedido XHR) a `/api/v1/auth/oauth/google/start?returnTo=/app`.
2. La API genera `state`, el verificador PKCE y un `nonce`; los guarda en una cookie firmada `oauth_tx` (httpOnly, Secure, `SameSite=Lax`, `Path=/api/v1/auth/oauth`, 10 minutos) y redirige a Google.
3. Google vuelve a `GET /api/v1/auth/oauth/google/callback?code=&state=`. La API compara el `state` con la cookie, canjea el código, verifica el `id_token` y borra la cookie.
4. Resuelve el usuario con la regla "Ingreso con proveedores" de la especificación: identidad existente, cuenta nueva, o error `ACCOUNT_EXISTS_LINK_REQUIRED` si el email ya tiene cuenta. Aplica las reglas de suspensión y registro cerrado.
5. Emite la sesión igual que `POST /auth/login` (cookie de refresh) y redirige a `/auth/listo?returnTo=/app`. Esa página del front llama a `/auth/refresh`, obtiene el token de acceso y navega. Ningún token viaja en la URL.
6. Cualquier error redirige a `/ingresar?error=<CODE>` y la pantalla de ingreso muestra el mensaje.

Vincular desde el perfil: como una navegación completa no lleva el token de acceso, el front pide antes `POST /auth/oauth/:provider/link-ticket` (autenticado), que devuelve un ticket de un solo uso válido por 60 segundos, y navega a `/start?mode=link&ticket=...`. `/start` exige además que la cookie de refresh de ese navegador (su path `/api/v1/auth` cubre `/auth/oauth`) sea una sesión viva del mismo usuario del ticket; si no, `LINK_SESSION_MISMATCH`. Así, un link con el ticket de otra persona no vincula nada (CSRF de vinculación, hallazgo F04 del informe de seguridad). El callback vincula la identidad a ese usuario en lugar de iniciar sesión.

| Método y ruta | Caso de uso |
| --- | --- |
| `GET /auth/providers` | AUTH-06 (botones habilitados) |
| `GET /auth/oauth/:provider/start`, `GET /auth/oauth/:provider/callback` | AUTH-06 |
| `POST /auth/oauth/:provider/link-ticket` | AUTH-07 (vincular) |
| `GET /auth/identities`, `DELETE /auth/identities/:id` | AUTH-07 (rechaza con `LAST_SIGN_IN_METHOD` si es el último) |
| `POST /auth/password` | AUTH-08 (solo si la cuenta no tiene contraseña) |

Direcciones y entornos:

- La dirección de retorno se arma con la variable `PUBLIC_APP_URL`, no con el host del pedido: `https://<app>.vercel.app/api/v1/auth/oauth/google/callback` en producción y `http://localhost:4200/api/v1/auth/oauth/google/callback` en local (por el proxy del front). Las dos se registran en Google Cloud.
- Variables nuevas: `PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `OAUTH_COOKIE_SECRET`.
- Todas las respuestas de `/auth/*` llevan `Cache-Control: no-store`: Vercel respeta las cabeceras de caché del origen en los reenvíos ([Vercel](https://vercel.com/docs/rewrites)) y una respuesta de autenticación nunca debe quedar cacheada.

Para sumar después:

- **Facebook**: su ingreso web no es OIDC estándar; su clase pide el perfil a la Graph API. Puede no devolver email: en ese caso el front pide el email en un paso extra antes de crear la cuenta.
- **Apple**: no acepta `localhost` como dirección de retorno, así que en local se prueba con un túnel HTTPS ([Better Auth](https://better-auth.com/docs/authentication/apple)). Vuelve con un POST (`response_mode=form_post`), por lo que su cookie `oauth_tx` necesita `SameSite=None`. El client secret es un JWT que la API firma en el momento con la clave `.p8`, sin renovarlo a mano. Entrega nombre y email solo en el primer ingreso y el email puede ser un relay privado de Apple.

### Protecciones adicionales

- Rate limiting con `@nestjs/throttler`: estricto en `/auth/*` (por ejemplo, 5 intentos por minuto por IP), general en el resto. La IP sale de `CLIENT_IP_HEADER` (`x-vercel-forwarded-for`, que el cliente no puede falsificar) y, si falta, de `X-Forwarded-For` confiando solo en `TRUST_PROXY_HOPS` saltos, nunca en toda la cadena.
- `helmet` para cabeceras de seguridad en la API, y `Cache-Control: no-store` en todas sus respuestas salvo `/plans` y `/health`.
- La web recibe sus cabeceras desde `vercel.ts`: CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` y `form-action` propios, `connect-src` con la URL de Render para el wake-up), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` y `Permissions-Policy`. `script-src` admite `'unsafe-inline'` porque las páginas prerenderizadas llevan scripts inline y el `autoCsp` de Angular todavía no funciona junto con el prerender.
- El origen en Render solo acepta pedidos que traen la cabecera secreta que agrega Vercel, salvo `/health` ([restringir el origen a Vercel](https://vercel.com/docs/rewrites)).
- CORS cerrado: solo el dominio de la app, y solo para `/health` (el resto llega por el mismo origen).
- Secretos solo en variables de entorno; nunca en el repo.
- Recuperación de contraseña por email queda para la segunda tanda (requiere un proveedor de email, por ejemplo Resend).

## Cotizaciones

La fuente es [DolarApi](https://dolarapi.com/docs/argentina/operations/get-dolar-bolsa): gratuita, de código abierto y con oficial, blue y MEP (que la API llama "bolsa"). Reemplaza a open.er-api.com, que solo da una cotización tipo oficial.

| Tipo en platin | Endpoint de DolarApi |
| --- | --- |
| `OFICIAL` | `GET /v1/dolares/oficial` |
| `BLUE` | `GET /v1/dolares/blue` |
| `MEP` | `GET /v1/dolares/bolsa` |
| Todos en un pedido | `GET /v1/dolares` |

Cada respuesta trae `compra`, `venta`, `casa`, `nombre`, `moneda` y `fechaActualizacion`.

Cómo se usan:

1. El módulo `rates` pide `GET /v1/dolares` (un solo pedido) cuando no hay cotización del día o la última tiene más de una hora, y hace upsert de oficial, blue y MEP en `ExchangeRate` por fecha y tipo.
2. Se dispara desde `POST /sync` y desde `GET /rates/latest`; no hay cron.
3. Si la API falla, se usa la última cotización guardada y la respuesta incluye `stale: true` con su fecha, para que la UI lo avise.
4. Al registrar un movimiento en una moneda distinta a la base, se congela en `rateToBase` la cotización de esa fecha del tipo elegido por el usuario. Si no hay de esa fecha exacta (fin de semana, feriado), se usa la anterior más cercana.
5. Para valuar se usa el precio de **venta** (lo que costaría comprar esos dólares hoy); queda como pregunta abierta por si se prefiere compra o promedio.
6. Las transferencias entre monedas no usan la API: la cotización es la que resulta de los dos montos que carga el usuario.
7. El cliente HTTP de cotizaciones queda detrás de una interfaz (`RateProvider`), así se puede cambiar de fuente sin tocar el resto.

Para cargar movimientos con fechas viejas hace falta histórico; DolarApi deriva esos datos a ArgentinaDatos. Queda en el backlog evaluarlo; mientras tanto, la cotización se puede corregir a mano en el movimiento.

## Infraestructura y deploy

Tres servicios gratuitos conectados por Vercel como único punto de entrada; un push a `main` despliega todo después de pasar el CI.

_Diagrama: Navegador → Vercel (HTTPS, mismo dominio) → Render por /api/* con la cabecera secreta; Render → Neon (Prisma) y → DolarApi (cotizaciones). Al abrir la app, el navegador llama directo a GET /health de Render para despertarlo._

El servidor gratuito de Render tarda alrededor de un minuto en despertar ([Render](https://render.com/docs/free)). Al abrir la app, el front llama directo a `/health` y muestra "Despertando el servidor" hasta que responde; recién ahí hace `refresh` y `sync` por `/api`. Así el primer pedido real no queda colgado detrás del arranque.

### Servicios

| Servicio | Qué corre | Configuración clave |
| --- | --- | --- |
| [Vercel](https://vercel.com/docs/rewrites) | Build de `apps/web` (salida estática) | `vercel.json` con rewrite de `/api/:path*` a Render y transform que agrega `x-origin-secret`; sin caché en `/api` |
| [Render](https://render.com/docs/free) | `apps/api` como Web Service gratuito, desplegado desde su Dockerfile | Comando de inicio: `prisma migrate deploy && node dist/main.js`; health check en `/health` |
| [Neon](https://neon.com/pricing) | Postgres | Dos cadenas de conexión: con pooler para la app y directa para migraciones |

### CI con GitHub Actions

En cada pull request y push a `main`:

1. `pnpm install` con caché.
2. `nx affected -t lint typecheck test build`: solo lo que cambió.
3. Tests e2e de la API contra un Postgres en contenedor de servicio.

Vercel y Render despliegan solos al hacer push a `main` (integración con GitHub). Cada pull request genera una preview de la landing en Vercel; no hay entorno de preview para la API, así que la app logueada se prueba en local.

### Variables de entorno

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `DATABASE_URL` | Render | Conexión con pooler de Neon (runtime) |
| `DIRECT_URL` | Render, local | Conexión directa de Neon (migraciones) |
| `JWT_ACCESS_SECRET` | Render | Firma de tokens de acceso |
| `REFRESH_TOKEN_PEPPER` | Render | Hash de refresh tokens |
| `ORIGIN_SECRET` | Render y Vercel | Cabecera secreta que solo agrega Vercel. Obligatoria en producción, salvo `ALLOW_DIRECT_ACCESS=true` |
| `ALLOW_DIRECT_ACCESS` | VPS | `true` para producción sin Vercel adelante (sin `ORIGIN_SECRET`) |
| `CLIENT_IP_HEADER` | Render | Cabecera con la IP real que el proxy de borde siempre pisa (`x-vercel-forwarded-for`). El rate limiting la prefiere: Vercel reenvía tal cual el `X-Forwarded-For` que manda el cliente |
| `TRUST_PROXY_HOPS` | Render, VPS | Cantidad de entradas desde la derecha de `X-Forwarded-For` hasta la del cliente (en Render, 4: Vercel, Cloudflare y Render agregan las suyas; vacía = 0, solo fuera de producción). Respaldo cuando falta `CLIENT_IP_HEADER`. Obligatoria en producción. El rate limiting usa la IP que está a esa distancia desde la derecha; lo que está más a la izquierda lo manda el cliente |
| `LOG_CLIENT_IP` | Render (temporal) | `true` para loguear la IP que ve la API en cada login y confirmar `TRUST_PROXY_HOPS` |
| `APP_ORIGIN` | Render | Dominio de la app, para CORS de `/health` |
| `RATES_BASE_URL` | Render | `https://dolarapi.com` |
| `ADMIN_EMAILS` | Render | Emails separados por coma que reciben el rol de administrador al ingresar |
| `PUBLIC_APP_URL` | Render, local | URL pública de la app (`https://<app>.vercel.app`; `http://localhost:4200` en local). Con ella se arman la dirección de retorno de OAuth y las redirecciones después del ingreso |
| `OAUTH_COOKIE_SECRET` | Render, local | Firma de la cookie `oauth_tx` (32 caracteres o más) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Render, local | Credenciales OAuth de Google. Sin ellas, el ingreso con Google está apagado y el botón no aparece. Si están, `PUBLIC_APP_URL` y `OAUTH_COOKIE_SECRET` son obligatorias |
| `API_DIRECT_URL` | Vercel (build) | URL de Render para el pedido de `/health` |

En local: `docker compose` con Postgres, `.env` a partir de `.env.example`, y `nx serve api` + `nx serve web` con proxy de `/api` al puerto de la API.

## Administración y planes

El administrador y los planes viven en la misma API y la misma app, separados por rol. Los límites de cada plan se verifican en un solo lugar del backend antes de crear cualquier recurso, y el modelo ya deja lugar para sumar cobro real después.

### Esquema (agregados)

```prisma
enum Role          { USER ADMIN }
enum UserStatus    { ACTIVE SUSPENDED }
enum PlanSource    { DEFAULT ADMIN REQUEST PAYMENT }   // PAYMENT: reservado para el cobro
enum RequestStatus { PENDING APPROVED REJECTED }

// En User:
//   role       Role       @default(USER)
//   status     UserStatus @default(ACTIVE)
//   lastSeenAt DateTime?

model Plan {
  id          String    @id @default(uuid()) @db.Uuid
  key         String    @unique          // "free", "pro"
  name        String
  description String
  priceArs    Decimal?  @db.Decimal(18, 2) // solo de referencia, no se cobra
  limits      Json      // validado con Zod: { maxAccounts, maxPockets, maxCards, maxGoals, maxFixed: int | null; investments: boolean }
  isDefault   Boolean   @default(false)   // exactamente uno (índice único parcial en SQL)
  isPublic    Boolean   @default(true)    // aparece en la página de planes
  sortOrder   Int       @default(0)
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
}

// Historial de planes de cada usuario; el vigente es el último sin vencer.
model UserPlan {
  id        String     @id @default(uuid()) @db.Uuid
  userId    String     @db.Uuid
  planId    String     @db.Uuid
  source    PlanSource
  startsAt  DateTime   @default(now())
  endsAt    DateTime?
  grantedBy String?    @db.Uuid   // admin que lo asignó
  @@index([userId, startsAt])
}

model PlanRequest {
  id        String        @id @default(uuid()) @db.Uuid
  userId    String        @db.Uuid
  planId    String        @db.Uuid
  message   String?
  status    RequestStatus @default(PENDING)
  decidedBy String?       @db.Uuid
  decidedAt DateTime?
  createdAt DateTime      @default(now())
  @@index([status, createdAt])
}

// Configuración global: plan por defecto, registro abierto, aviso, categorías sugeridas, cotización por defecto.
model AppSetting {
  key       String   @id
  value     Json     // cada clave con su esquema Zod en libs/contracts
  updatedAt DateTime @updatedAt
  updatedBy String?  @db.Uuid
}

model AuditLog {
  id           String   @id @default(uuid()) @db.Uuid
  actorId      String   @db.Uuid
  action       String   // "user.suspend", "plan.update", "setting.update"...
  targetUserId String?  @db.Uuid
  payload      Json     // antes y después del cambio; nunca datos financieros
  createdAt    DateTime @default(now())
  @@index([createdAt])
  @@index([targetUserId])
}

// Un registro por usuario y día con actividad: alimenta "activos en 7 y 30 días".
model ActivityDay {
  userId String   @db.Uuid
  date   DateTime @db.Date
  @@id([userId, date])
}
```

### Límites de plan

- `libs/domain`: `checkLimit(limits, resource, used)` y `resolveCurrentPlan(userPlans, defaultPlan, now)`, puras y con tests.
- `apps/api`: `EntitlementsService` con `assertCanCreate(userId, resource)`, llamado por cada servicio antes de crear una cuenta, un apartado, una tarjeta, una meta o un fijo, y un decorador `@RequiresFeature('investments')` para los endpoints de una funcionalidad. Si no se puede, responde 403 con `code: PLAN_LIMIT_REACHED` o `FEATURE_NOT_IN_PLAN` y `{ resource, limit, used }`.
- `GET /me/plan`: plan vigente, límites, uso actual y vencimiento. El front lo guarda en un store y lo usa para mostrar el uso, ocultar funcionalidades y abrir la hoja "Pedir otro plan" cuando la API responde con esos códigos.
- `GET /plans` es público (sin login) para la página de planes; `POST /plan-requests` pide un cambio.
- La migración crea los planes iniciales ("Gratis" por defecto y "Pro") con límites a definir desde el panel.

### API de administración

- Controladores bajo `/api/v1/admin/*` con `RolesGuard('ADMIN')`, que consulta el rol en la base en cada pedido (no confía solo en el token).
- El JWT suma el claim `role` para que el front muestre u oculte el panel; el cambio de rol se refleja al próximo refresh.
- El rol se otorga con la variable `ADMIN_EMAILS` (lista separada por comas): al ingresar, un email de la lista pasa a `ADMIN`. No hay forma de pedirlo desde la app.
- El módulo `admin` solo importa `users`, `plans`, `settings`, `audit` y `metrics`; nunca los módulos financieros. Un test e2e verifica que ninguna respuesta de `/admin` contenga montos ni nombres de cuentas.
- Toda escritura de admin se hace dentro de una transacción que también inserta su `AuditLog`.
- Un middleware registra `ActivityDay` y `lastSeenAt` como máximo una vez por usuario y día.
- Suspender revoca todas las familias de refresh tokens y hace que el login responda `ACCOUNT_SUSPENDED`. El guard de JWT consulta el estado del usuario en cada pedido: el access token de un suspendido o de un usuario borrado responde 401 enseguida, sin esperar los 15 minutos de vida del token.

| Método y ruta | Caso de uso |
| --- | --- |
| `GET /admin/metrics` | ADM-02 |
| `GET /admin/users?query=&plan=&status=&cursor=`, `GET /admin/users/:id` | ADM-03 |
| `POST /admin/users/:id/plan`, `/suspend`, `/reactivate`, `/logout`; `DELETE /admin/users/:id` | ADM-04, PLN-06 |
| `GET/POST /admin/plans`, `PATCH /admin/plans/:id` | PLN-01, 02 |
| `GET/PUT /admin/settings/:key` | ADM-05 |
| `GET /admin/plan-requests`, `POST /admin/plan-requests/:id/approve` y `/reject` | ADM-06 |
| `GET /admin/audit?cursor=` | ADM-07 |

### Web

- Rutas `/admin/**` en la misma app Angular, con carga diferida y un guard por rol. Layout propio de escritorio (barra lateral: Resumen, Usuarios, Planes, Solicitudes, Configuración, Auditoría); reutiliza `libs/web-ui`.
- Perfil del usuario: sección "Tu plan" con el uso de cada límite (`pl-progress`) y el botón para pedir otro plan.
- `/planes`: página pública prerenderizada con la misma identidad que la landing, que lee `GET /plans` al cargar.
- El aviso global (si hay uno vigente) se muestra arriba de la app, descartable por sesión.

### Cobro, más adelante

Cuando se cobre: una interfaz `PaymentProvider` con una implementación para suscripciones de Mercado Pago, un webhook que crea `UserPlan` con `source: PAYMENT` y `endsAt` al fin del período pago, y la página de planes con botón de suscripción. Nada de lo anterior cambia: los límites siguen saliendo del plan vigente.

## Docker y VPS

La API se empaqueta como imagen Docker desde el primer día: la misma imagen corre en Render y en un VPS, y Docker Compose se usa también para desarrollo local. Mudarse a un VPS no requiere tocar código, solo levantar el compose y apuntar el dominio.

### Imágenes y archivos

| Archivo | Qué hace |
| --- | --- |
| `apps/api/Dockerfile` | Multi-stage: instala dependencias con pnpm, corre `nx build api` y genera el cliente de Prisma; la imagen final (Node slim, usuario sin privilegios) lleva solo `dist`, dependencias de producción y las migraciones |
| `apps/api/docker-entrypoint.sh` | Corre `prisma migrate deploy` y después arranca el servidor |
| `apps/web/Dockerfile` | Solo para el VPS: build de Angular y una imagen de Caddy con los archivos estáticos |
| `docker-compose.yml` | Desarrollo local: Postgres (y opcionalmente la API) |
| `deploy/docker-compose.prod.yml` | VPS: Caddy, API, Postgres y el job de backup |
| `deploy/Caddyfile` | Proxy y archivos estáticos con HTTPS automático |

```
platin.example.com {
  encode zstd gzip
  handle /api/* {
    reverse_proxy api:3000
  }
  handle {
    root * /srv/web
    try_files {path} {path}/index.html /index.html
    file_server
  }
}
```

Caddy cumple en el VPS el mismo papel que Vercel en el plan gratuito: un solo dominio, `/api` reenviado a la API y el resto servido como estático. Por eso el front y la cookie de auth no cambian.

### Qué cambia según dónde corra

| Tema | Render + Vercel + Neon | VPS |
| --- | --- | --- |
| Punto de entrada | Rewrite de Vercel | Caddy |
| HTTPS | Automático del proveedor | Automático de Caddy (Let's Encrypt) |
| Base de datos | Neon | Contenedor de Postgres con volumen persistente |
| Cabecera secreta | Sí | No hace falta: la API no se expone, solo Caddy |
| Servidor dormido | Sí, se despierta con `/health` | No |
| Backups | Los de Neon | `pg_dump` diario a almacenamiento externo compatible con S3, con retención de 7 diarios y 4 semanales |
| Deploy | Automático al hacer push | GitHub Actions construye las imágenes, las sube a GitHub Container Registry y entra por SSH para `docker compose pull && docker compose up -d` |
| Mantenimiento | Del proveedor | Propio: actualizaciones, firewall con solo 22, 80 y 443 abiertos, SSH solo con clave, fail2ban |

### Reglas para que siga siendo portable

- Toda la configuración por variables de entorno; nada del proveedor dentro del código.
- La API escucha en `PORT` y escribe logs en JSON a la salida estándar.
- `ORIGIN_SECRET` es obligatoria en producción. Un VPS sin Vercel adelante la desactiva de forma explícita con `ALLOW_DIRECT_ACCESS=true`, y ajusta `TRUST_PROXY_HOPS` a su propio proxy (por ejemplo, 1 con Caddy).
- En producción la API no arranca con los secretos de ejemplo (`change-me…`), con un solo carácter repetido ni con `JWT_ACCESS_SECRET` igual a `REFRESH_TOKEN_PEPPER`.
- `/health` sirve para todos: Docker `HEALTHCHECK`, Render y el wake-up del front.
- Las migraciones corren al arrancar el contenedor, igual en todos los entornos.

## Testing y convenciones

Las reglas de negocio se testean como funciones puras; la API, con tests e2e contra Postgres real; el front, solo en lo que tiene lógica.

### Qué se testea

| Capa | Herramienta | Qué cubre | Objetivo |
| --- | --- | --- | --- |
| `libs/domain` | Vitest | Cada regla de la especificación, con casos borde (meses cortos, cierre en feriado, redondeo de cuotas, metas vencidas) | 100 % de las funciones públicas |
| `libs/contracts` | Vitest | Esquemas: montos como string, fechas y períodos válidos | Casos de error principales |
| `apps/api` | Vitest + Supertest, Postgres en Docker | Cada endpoint: camino feliz, validación, aislamiento entre usuarios, transacciones | Un archivo e2e por módulo |
| `apps/web` | Vitest + Angular Testing Library | Stores, carga rápida, interceptor de auth | Lo que tiene lógica; no snapshots |
| Punta a punta | Playwright (segunda tanda) | Registro → cargar gasto → ver inicio | Un recorrido por flujo crítico |

Los casos de la especificación son tests literales. Por ejemplo: meta de USD 15.000 a diciembre 2027 con USD 4.200 en octubre 2026 devuelve USD 771,43 por mes.

### Convenciones de código

- TypeScript `strict`; prohibido `any` salvo justificado en un comentario.
- Código, nombres y commits en inglés; textos de la interfaz en español en un archivo por feature (preparado para i18n aunque no se use).
- Commits con Conventional Commits (`feat(cards): split installments`).
- ESLint + Prettier; `nx affected -t lint` en el CI.
- Nunca `number` para montos: `Money` en el dominio, `Decimal` de Prisma en la API, string en el JSON.
- Fechas: `YYYY-MM-DD` sin zona horaria para fechas de negocio; `DateTime` UTC solo para auditoría (`createdAt`). El "hoy" del usuario se calcula en `America/Argentina/Buenos_Aires`.
- Nada de lógica de negocio en controladores ni componentes: va a `libs/domain` o al servicio.
- Cada decisión que cambie este documento se registra como ADR corto en `docs/adr/`.

## Preguntas abiertas

Seis puntos a resolver; los tres primeros se verifican en la fase 0 del plan, antes de escribir funcionalidades.

- [ ] **Prisma 7 + Nest en ESM**: Prisma 7 exige ESM y un adaptador de driver. Verificar que el build de Nest dentro de Nx funcione así; si trae fricción, usar Prisma 6 (CommonJS) y migrar después.
- [ ] **Reenvío de Vercel con el servidor dormido**: la documentación no indica un tiempo máximo para reenvíos externos. Probar un pedido a `/api` con Render dormido; el pedido directo a `/health` ya evita depender de esto.
- [ ] **Licencia de Uncut Sans**: confirmar que permite autoalojarla en la app.
- [ ] **Precio para valuar dólares**: venta (propuesta actual), compra o promedio.
- [ ] **Histórico de cotizaciones**: evaluar ArgentinaDatos para cargar movimientos con fechas viejas.
- [ ] **Dominio**: usar el subdominio gratuito de Vercel (`platin.vercel.app` si está libre) o comprar uno propio.

## Fuentes

- [Prisma: guía de migración a v7](https://www.prisma.io/docs/v6/orm/more/upgrades/to-v7)
- [Vercel: rewrites a orígenes externos](https://vercel.com/docs/rewrites)
- [Render: plan gratuito](https://render.com/docs/free)
- [Neon: precios y límites](https://neon.com/pricing)
- [DolarApi: Dólar Bolsa (MEP)](https://dolarapi.com/docs/argentina/operations/get-dolar-bolsa)
- [Angular: versión 22](https://www.gitclear.com/open_repos/angular/angular/release/v22.0.6)
