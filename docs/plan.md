# platin — Plan de implementación

Oct 23, 2026 · @Jose

Nueve fases para llegar al MVP de platin con Claude Code, cada una con su prompt listo para pegar. Se apoya en la [especificación funcional](https://claude.ai/artifact/QfQnXa1fhMndVJKuFPGbPY) y en la [arquitectura](https://claude.ai/artifact/BVim3tHX5vux8aCx6sRRKj).

## Cómo trabajar con Claude Code

Una fase por sesión, en su propia rama, terminando en un pull request que revisás vos antes de mergear. Claude Code trabaja mejor con objetivos acotados y criterios de terminado claros que con "hacé la app".

### Preparar el repo (una sola vez)

1. Exportar la especificación, la arquitectura y este plan como Markdown (menú de cada documento) y guardarlos en \`docs/plan.md\`, `docs/especificacion.md` y `docs/arquitectura.md`.
2. Guardar los mockups como capturas en `docs/mockups/` (una imagen por pantalla), para que Claude Code pueda mirarlos.
3. Copiar los íconos SVG a `docs/brand/`.
4. Poner el `CLAUDE.md` en la raíz.
5. Hacer el primer commit en `main` con todo eso.

### En cada fase

1. Arrancar una sesión nueva de Claude Code (contexto limpio).
2. Pegar el prompt de la fase. Todos le piden leer `CLAUDE.md` y las secciones relevantes de `docs/` antes de escribir código, y proponer un plan antes de implementar.
3. Revisar el plan que propone y corregirlo si hace falta; es el momento más barato para cambiar algo.
4. Dejarlo implementar. Pedirle que corra lint, typecheck y tests antes de dar algo por terminado.
5. Revisar el PR: correr la app en local, probar el criterio de terminado de la fase y leer los tests.
6. Mergear y, si apareció una decisión nueva, pedirle que la registre en `docs/adr/` o que actualice `CLAUDE.md`.

Si una fase se hace larga, dividila: "hacé solo el backend de la fase 4" y en otra sesión el frontend.

## Hoja de ruta

Las fases van en orden: cada una deja algo desplegado y usable que la siguiente aprovecha. A partir de la fase 3 ya podés empezar a cargar tus datos reales.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 0 | Monorepo, Docker, CI, deploy vacío | — | La app vacía responde en producción y `/api/v1/health` contesta a través de Vercel |
| 1 | Reglas de negocio en `libs/domain` | Reglas de la especificación | Todos los ejemplos de la especificación pasan como tests |
| 2 | Auth y shell de la app | AUTH-01, 02, 04 | Me registro, entro, cierro el navegador y sigo logueado; veo la barra inferior |
| 3 | Cuentas, categorías, movimientos, carga rápida | CTA-01 a 04, MOV-01 a 05 | Cargo un gasto en 3 toques desde el celular y el saldo de la cuenta cambia |
| 4 | Tarjetas, resúmenes, cuotas | TAR-01 a 05, 07, 08 | Cargo una compra en 12 cuotas y la veo repartida en los resúmenes correctos |
| 5 | Fijos, sync, compromisos | FIJ-01 a 04, COM-01, 02 | Al abrir la app aparecen los pendientes del mes y veo los compromisos de 12 meses |
| 6 | Inicio y cotizaciones | DAS-01, cotizaciones | El inicio muestra "Libre este mes" con datos reales y las cotizaciones del día |
| 7 | Ahorros y metas | MET-01 a 03 | La meta del auto calcula USD 771 por mes con los datos del ejemplo |
| 8 | Landing y pulido | LAN-01, 02 | La landing está publicada y el MVP reemplaza a la app anterior |

## Fase 0 — Cimientos

Deja el esqueleto completo funcionando de punta a punta antes de escribir una sola funcionalidad, y resuelve las tres preguntas abiertas técnicas de la arquitectura.

**Antes de empezar (vos):** cuentas creadas en Neon, Render y Vercel; repo en GitHub con el commit inicial de `docs/` y `CLAUDE.md`.

Tareas:

- Workspace Nx con pnpm: `apps/web` (Angular), `apps/api` (NestJS), `libs/domain`, `libs/contracts`, `libs/web-ui`, con tags y `@nx/enforce-module-boundaries`.
- TypeScript estricto, ESLint, Prettier, Vitest configurado en todos los proyectos.
- Prisma 7 en `apps/api` con un modelo mínimo (`User`) y una migración inicial. Si Prisma 7 + Nest en ESM da problemas, usar Prisma 6 y dejar un ADR.
- Endpoint `GET /api/v1/health` que verifica la conexión a la base.
- Tailwind en `apps/web` con los tokens de color de la arquitectura y las dos tipografías; una página de prueba con los colores.
- Dockerfile de la API, `docker-compose.yml` local con Postgres, `.env.example`.
- GitHub Actions: lint, typecheck, test y build de lo afectado.
- `vercel.json` con el rewrite de `/api` y la cabecera secreta; Render desplegando el Dockerfile.

**Terminado cuando:** la URL de Vercel muestra la página de prueba con la paleta de platin y `https://<app>/api/v1/health` responde OK a través de Vercel, incluso con Render dormido.

```
Leé CLAUDE.md y docs/arquitectura.md completos antes de empezar.

Vamos a hacer la Fase 0 de docs/plan.md: los cimientos del monorepo de platin. Todavía no hay ninguna funcionalidad de negocio; el objetivo es que el esqueleto completo funcione de punta a punta: local, CI y producción.

Alcance:
1. Workspace Nx con pnpm: apps/web (Angular, standalone, zoneless), apps/api (NestJS), libs/domain, libs/contracts y libs/web-ui. Configurá los tags y las reglas de @nx/enforce-module-boundaries exactamente como dice la sección "Monorepo" de la arquitectura.
2. TypeScript strict, ESLint, Prettier y Vitest en todos los proyectos.
3. Prisma 7 en apps/api (adaptador @prisma/adapter-pg, prisma.config.ts, generador prisma-client con output explícito) con solo el modelo User y una migración inicial. Si Prisma 7 con Nest en ESM no compila o no corre dentro de Nx, pasá a Prisma 6, explicame por qué y dejá un ADR en docs/adr/.
4. GET /api/v1/health que haga un SELECT 1 contra la base.
5. Tailwind en apps/web con los tokens de color y las tipografías de la sección "Frontend > Diseño". Una página temporal en / que muestre los colores y las dos tipografías.
6. apps/api/Dockerfile multi-stage y entrypoint con prisma migrate deploy, docker-compose.yml local con Postgres y .env.example con todas las variables de la arquitectura.
7. Workflow de GitHub Actions: nx affected -t lint typecheck test build.
8. vercel.json con el rewrite de /api/:path* a la URL de Render y la cabecera x-origin-secret, y el middleware en la API que la verifica (opcional si ORIGIN_SECRET no está definida; /health exento).

Fuera de alcance: auth, cualquier entidad que no sea User, pantallas reales.

Forma de trabajo:
- Antes de tocar código, proponeme un plan con los pasos y los comandos de Nx que vas a usar, y esperá mi OK.
- Trabajá en la rama feat/fase-0-cimientos con commits chicos en Conventional Commits.
- Al terminar, corré lint, typecheck, test y build de todo el workspace y mostrame el resultado.
- Escribí en el README cómo levantar todo en local y qué variables configurar en Neon, Render y Vercel.
- Abrí un PR con un resumen y la lista de cosas que tengo que configurar yo a mano.
```

## Fase 1 — Reglas de negocio

Todas las reglas de la especificación como funciones puras y testeadas en `libs/domain`, antes de cualquier endpoint. Es la fase que más errores evita después: cuotas, cierres de tarjeta y metas quedan probados de una vez.

Tareas:

- Enums compartidos (`Currency`, `RateType`, etc.) y tipos `Period` (`YYYY-MM`) y `LocalDate` (`YYYY-MM-DD`).
- Clase `Money` sobre decimal.js: suma, resta, multiplicación por cotización, reparto, redondeo mitad hacia arriba a 2 decimales, formateo `es-AR`.
- Ciclo de tarjeta: `buildStatementDates`, `statementPeriodFor`.
- Cuotas: `splitInstallments` (con inicio en la cuota k), asignación de cuotas a períodos.
- Fijos: `duePeriods` con frecuencia, inicio, fin, pausa y monto vigente por período.
- Compromisos: `commitmentsByMonth` por moneda.
- Metas: `goalProjection` (faltante, meses restantes, aporte mensual, ritmo, simulación).
- Saldo de cuenta a partir de sus movimientos y transferencias.

**Terminado cuando:** cada ejemplo numérico y cada regla de la especificación tiene su test y todos pasan, incluidos los casos borde.

```
Leé CLAUDE.md, la sección "Reglas de negocio" de docs/especificacion.md y la sección "Backend > Lógica de dominio" de docs/arquitectura.md antes de empezar.

Vamos a hacer la Fase 1 de docs/plan.md: implementar todas las reglas de negocio de platin como funciones puras en libs/domain, con tests en Vitest. No hay base de datos, ni HTTP, ni Angular en esta fase.

Alcance:
1. Enums compartidos (Currency, RateType, AccountType, TxType, TxStatus, StatementStatus, etc., iguales al esquema de Prisma de la arquitectura) y tipos Period (YYYY-MM) y LocalDate (YYYY-MM-DD) con funciones para sumar meses, comparar y convertir.
2. Money sobre decimal.js: inmutable, con moneda, suma, resta, multiplicación por cotización, reparto en N partes y redondeo half-up a 2 decimales. Nunca usar number para montos.
3. Ciclo de tarjeta: buildStatementDates(card, period) y statementPeriodFor(card, purchaseDate, overrides).
4. Cuotas: splitInstallments(total, count, startAt) con la diferencia de redondeo en la última cuota, y asignación de cada cuota a su período.
5. Fijos: duePeriods(fixed, from, to) respetando frecuencia, inicio, fin, pausa y el monto vigente de cada período.
6. Compromisos: commitmentsByMonth(input, months), separado por moneda.
7. Metas: goalProjection(goal, accumulated, today, monthly?) con faltante, meses restantes, aporte mensual, ritmo (adelantado/atrasado y por cuánto) y fecha estimada para un aporte dado.
8. Saldo de cuenta: accountBalance(initial, transactions, transfers).

Tests obligatorios (además de los que consideres):
- Todos los ejemplos numéricos de la especificación como tests literales, por ejemplo: meta de USD 15.000 a diciembre 2027 con USD 4.200 en octubre 2026 → USD 771,43 por mes.
- Compra el mismo día del cierre, compra el día después del cierre, día de cierre 31 en febrero.
- 3 cuotas de $ 100.000 → 33.333,33 / 33.333,33 / 33.333,34.
- "Voy por la 4 de 12" genera solo las cuotas 4 a 12.
- Fijo con aumento desde un mes: los meses anteriores conservan el monto viejo.
- Ninguna función lee la fecha del sistema: "hoy" siempre es un parámetro.

Forma de trabajo:
- Antes de codear, proponeme la API pública de libs/domain (firmas de funciones y tipos) y esperá mi OK.
- Rama feat/fase-1-dominio, commits chicos.
- Si una regla de la especificación es ambigua, no la inventes: preguntame.
- Al terminar, corré los tests con cobertura y mostrame el resumen. Abrí el PR.
```

## Fase 2 — Auth y shell de la app

Registro, login y sesión persistente, más el esqueleto visual de la app: barra inferior, barra lateral en escritorio, botón + y la pantalla de "despertando el servidor". También los primeros componentes de `libs/web-ui`.

Tareas:

- Backend: módulos `auth` y `users`, `RefreshToken`, rotación con detección de reuso, argon2id, guard global, `@CurrentUser()`, throttler y helmet.
- Frontend: páginas `/ingresar` y `/registro`, servicio de auth con el token en un signal, interceptor con refresh automático, guard de `/app`.
- Arranque de la app: pedido a `/health`, pantalla de espera si tarda, luego refresh.
- Shell: layout con barra inferior (celular) y lateral (escritorio), botón + que por ahora abre una hoja vacía, modo oscuro, perfil con moneda base y cotización preferida.
- `libs/web-ui`: `pl-button`, `pl-segmented`, `pl-bottom-sheet`, `pl-money`, `pl-empty-state`.

**Terminado cuando:** me registro, cierro el navegador, vuelvo a abrir y sigo adentro; el usuario B no puede ver nada del usuario A (test e2e); la shell se ve como en los mockups.

```
Leé CLAUDE.md, la sección "Auth y seguridad" y "Frontend" de docs/arquitectura.md, y mirá los mockups en docs/mockups/ antes de empezar.

Vamos a hacer la Fase 2 de docs/plan.md: autenticación completa y la shell visual de la app.

Backend:
1. Modelos User y RefreshToken según el esquema de la arquitectura, con su migración.
2. Módulo auth: POST /auth/register, /auth/login, /auth/refresh, /auth/logout. JWT de acceso de 15 minutos; refresh token opaco de 30 días en cookie httpOnly, Secure, SameSite=Lax, Path=/api/v1/auth, guardado hasheado. Rotación en cada refresh; si llega un token ya revocado, revocar toda la familia.
3. Contraseñas con argon2id, mínimo 10 caracteres. Validación con los esquemas Zod de libs/contracts.
4. Guard JWT global (salvo /auth/* y /health), decorador @CurrentUser(), throttler estricto en /auth/*, helmet.
5. Módulo users: GET y PATCH /users/me (nombre, moneda base, cotización preferida).
6. Tests e2e: registro, login, refresh con rotación, reuso detectado, logout, y que un usuario no pueda leer el perfil de otro.

Frontend:
1. Páginas /ingresar y /registro con la identidad de platin (prerenderizadas).
2. AuthService con el access token en un signal, interceptor que ante un 401 hace un único refresh y reintenta, guard para /app.
3. Arranque: pedido directo a la URL de Render /health; si tarda más de 1,5 s, pantalla "Despertando el servidor" con el ícono de platin; después refresh y entrar.
4. Shell de /app: barra inferior en celular (Inicio, Movimientos, +, Tarjetas, Ahorros) y barra lateral en escritorio; botón + verde que abre un pl-bottom-sheet vacío; modo oscuro; página de perfil.
5. libs/web-ui: pl-button, pl-segmented, pl-bottom-sheet (sobre Angular CDK), pl-money (con modo ocultar montos) y pl-empty-state. Accesibles: foco visible, aria-labels, áreas táctiles de 44 px.

Forma de trabajo:
- Proponeme el plan primero y esperá mi OK.
- Rama feat/fase-2-auth-shell. Lint, typecheck y tests en verde antes del PR.
- En el PR, incluí capturas de la shell en celular y escritorio, en modo claro y oscuro.
```

## Fase 3 — Cuentas, movimientos y carga rápida

El corazón del uso diario: cuentas con saldo calculado, categorías, ingresos, gastos, transferencias (incluida la compra de dólares) y la carga rápida en 3 toques. Desde acá ya podés usar platin con tus datos reales.

Tareas:

- Backend: módulos `accounts`, `categories`, `transactions`, `transfers`; saldos con `libs/domain`; ajuste de saldo; confirmación de pendientes en lote; paginación por cursor; categorías sugeridas al registrarse.
- Cotización provisoria: mientras no esté la fase 6, un movimiento en dólares pide la cotización a mano.
- Frontend: pantalla de cuentas, detalle de cuenta, lista de movimientos (agrupada por día, filtros, búsqueda) y carga rápida.
- `libs/web-ui`: `pl-chip`, `pl-amount-keypad`, `pl-list-item`.

**Terminado cuando:** desde el celular cargo un gasto en 3 toques, una compra de dólares como transferencia, y los saldos de las dos cuentas cambian correctamente.

```
Leé CLAUDE.md, los módulos 2 y 3 de docs/especificacion.md (CTA-01 a 04, MOV-01 a 05), las secciones "Modelo de datos" y "Backend" de docs/arquitectura.md, y los mockups Carga rápida y Movimientos en docs/mockups/.

Vamos a hacer la Fase 3 de docs/plan.md: cuentas, categorías, movimientos, transferencias y carga rápida.

Backend:
1. Modelos Account, Category, Transaction y Transfer según el esquema de la arquitectura, con la check constraint de Transfer (exactamente un destino) en SQL dentro de la migración.
2. Módulos accounts, categories, transactions y transfers con los endpoints de la tabla de la arquitectura. Todo filtrado por userId; recurso ajeno = 404.
3. Saldos calculados con accountBalance de libs/domain (no se guardan). POST /accounts/:id/adjust crea un movimiento de ajuste por la diferencia.
4. Categorías sugeridas creadas al registrarse (supermercado, delivery, transporte, servicios, salud, salidas, sueldo, etc.) con íconos de Lucide.
5. GET /transactions con paginación por cursor y filtros (período, cuenta, categoría, tipo, texto). POST /transactions/confirm para confirmar pendientes en lote.
6. Mientras no exista el módulo de cotizaciones, un movimiento en una moneda distinta a la base exige rateToBase en el request.
7. Tests e2e por módulo, incluido aislamiento entre usuarios y que los saldos cierren después de transferencias entre monedas.

Frontend:
1. Cuentas: lista con saldo por cuenta y total por moneda, alta y edición, detalle con movimientos, ajuste de saldo.
2. Movimientos: igual al mockup (selector de mes, totales, filtros por tipo, lista agrupada por día, pendientes con etiqueta amarilla que no suman).
3. Carga rápida en el pl-bottom-sheet del botón +: segmentado Gasto/Ingreso/Transferencia, monto con pl-amount-keypad, categorías recientes como pl-chip, cuenta preseleccionada (la última usada), fecha "Hoy" editable, nota opcional, guardar. En escritorio también se abre con Ctrl+K. En modo Transferencia: cuenta origen, destino y los dos montos si las monedas difieren, mostrando la cotización resultante.
4. pl-chip, pl-amount-keypad y pl-list-item en libs/web-ui.

Forma de trabajo:
- Plan primero, esperá mi OK. Si la fase te parece grande, proponé dividirla en backend y frontend.
- Rama feat/fase-3-movimientos. Todo en verde antes del PR, con capturas de la carga rápida y de Movimientos en celular.
```

## Fase 4 — Tarjetas, resúmenes y cuotas

La sección de tarjetas completa: alta con días de cierre y vencimiento, consumos en cuotas repartidos solos en los resúmenes, carga de cuotas ya empezadas, cierre con el total del banco y pago desde una cuenta.

Tareas:

- Backend: modelos `CreditCard`, `CardStatement`, `CardCharge`, `Installment`, `StatementAdjustment`; creación perezosa de resúmenes; consumos con cuotas en una transacción; cierre con ajuste; pago como `Transfer`.
- Los consumos con tarjeta aparecen también en Movimientos (filtro Tarjetas).
- Frontend: lista de tarjetas, detalle como en el mockup (tarjeta violeta, límite, pestañas Resumen / Próximos / Cuotas, barras de cuotas por resumen), alta de consumo, cierre y pago.
- La carga rápida suma la opción de pagar con tarjeta y elegir cantidad de cuotas.

**Terminado cuando:** cargo una compra de $ 550.000 en 12 cuotas un día antes del cierre y otra un día después, y cada una cae en el resumen correcto; migro una compra "4 de 12"; cierro un resumen con intereses y lo pago.

```
Leé CLAUDE.md, el módulo 4 de docs/especificacion.md (TAR-01 a 05, 07 y 08), las reglas "Ciclo de la tarjeta" y "Cuotas", las secciones "Modelo de datos" y "Backend" de docs/arquitectura.md, y el mockup Tarjeta con cuotas.

Vamos a hacer la Fase 4 de docs/plan.md: tarjetas de crédito, resúmenes, consumos en cuotas, cierre y pago.

Backend:
1. Modelos CreditCard, CardStatement, CardCharge, Installment y StatementAdjustment según la arquitectura, con su migración.
2. Los resúmenes se crean cuando hacen falta (al cargar un consumo o al consultar períodos), con fechas de buildStatementDates de libs/domain.
3. POST /cards/:id/charges: usa statementPeriodFor y splitInstallments de libs/domain y crea consumo, resúmenes faltantes y cuotas en una sola transacción. Soporta startInstallment para "voy por la k de N": solo genera las cuotas k a N, desde el resumen abierto.
4. Editar o borrar un consumo regenera solo las cuotas que no estén en un resumen cerrado; si alguna lo está, devolver un error con code CARD_STATEMENT_CLOSED.
5. GET /cards/:id/statements con totales en ARS y USD calculados; GET /cards/:id/installments?active=true con número actual, total de cuotas y monto restante.
6. POST /statements/:id/close con los totales del banco: la diferencia se guarda como StatementAdjustment con su categoría.
7. POST /statements/:id/payments: crea un Transfer desde una cuenta, por pesos o dólares por separado, y actualiza el estado (PARTIALLY_PAID o PAID).
8. Tests e2e con los casos del criterio de terminado de la fase.

Frontend:
1. /app/tarjetas con la lista y /app/tarjetas/:id igual al mockup: tarjeta violeta con resumen abierto, días al cierre y vencimiento; límite disponible; pestañas Resumen, Próximos y Cuotas; barras de cuotas por resumen; lista de cuotas activas con progreso "4 de 12".
2. Alta y edición de tarjeta. Alta de consumo con vista previa del reparto de cuotas (calculada en el front con libs/domain).
3. Cierre de resumen (cargar los totales del banco y ver la diferencia) y pago (cuenta, monto, moneda).
4. En la carga rápida, al elegir una tarjeta como medio de pago, aparece el selector de cuotas.
5. Los consumos con tarjeta se ven en Movimientos con el filtro Tarjetas.

Forma de trabajo:
- Plan primero, esperá mi OK. Si conviene, dividí en backend y frontend.
- Rama feat/fase-4-tarjetas. Todo en verde antes del PR, con capturas del detalle de tarjeta.
```

## Fase 5 — Fijos, sync y compromisos

Los gastos e ingresos que se repiten dejan de cargarse a mano: generan pendientes solos al abrir la app. Y aparece la vista de compromisos: cuánto tengo ya comprometido en los próximos 12 meses.

Tareas:

- Backend: modelos `FixedItem` y `FixedAmount`; módulo `fixed`; módulo `sync` que genera pendientes y resúmenes faltantes de forma idempotente; módulo `commitments`.
- Frontend: pantalla de fijos (alta, aumento desde un mes, pausa, fin), bandeja "Para confirmar" y pantalla de compromisos.
- La app llama a `POST /sync` al arrancar, después del refresh.

**Terminado cuando:** creo el alquiler y el sueldo como fijos, abro la app al mes siguiente (simulando la fecha) y aparecen como pendientes una sola vez; los confirmo en lote; la vista de compromisos muestra cuotas y fijos de los próximos 12 meses por moneda.

```
Leé CLAUDE.md, los módulos 5 y 6 de docs/especificacion.md (FIJ-01 a 04, COM-01 y 02), las reglas "Fijos y movimientos pendientes" y "Compromisos de un mes", y las secciones "Modelo de datos" y "Backend" de docs/arquitectura.md.

Vamos a hacer la Fase 5 de docs/plan.md: fijos, sincronización al abrir la app y compromisos.

Backend:
1. Modelos FixedItem y FixedAmount según la arquitectura, con su migración.
2. Módulo fixed: CRUD, POST /fixed/:id/amounts para cambiar el monto desde un período (sin tocar los anteriores), pausar y finalizar.
3. Módulo sync: POST /sync genera, para cada fijo activo, un Transaction PENDING por cada período vencido desde lastGeneratedPeriod, usando duePeriods de libs/domain. Debe ser idempotente: la restricción única (fixedId, fixedPeriod) garantiza que llamarlo dos veces no duplique nada. También crea los resúmenes de tarjeta faltantes hasta el período actual. Todo en una transacción por usuario.
4. "Hoy" se calcula en America/Argentina/Buenos_Aires y se inyecta con un ClockService, para poder simular fechas en los tests.
5. Módulo commitments: GET /commitments?months=12 con commitmentsByMonth de libs/domain: cuotas de resúmenes por mes de vencimiento + fijos de gasto activos con su monto vigente, separado por moneda y valuado en moneda base.
6. Tests e2e: sync idempotente, cambio de monto desde un período, fijo pausado que no genera, compromisos que cierran con las cuotas de la fase 4.

Frontend:
1. /app/fijos: lista de fijos con próximo período y monto, alta y edición, "cambiar monto desde", pausar y finalizar.
2. Bandeja "Para confirmar": lista de pendientes; se confirma deslizando o en lote, con la opción de corregir el monto antes.
3. /app/compromisos: los próximos 12 meses con lo comprometido por mes y moneda, y el detalle de qué cuotas y fijos lo componen.
4. Al arrancar la app, después del refresh, llamar a POST /sync.

Forma de trabajo:
- Plan primero, esperá mi OK.
- Rama feat/fase-5-fijos-compromisos. Todo en verde antes del PR.
```

## Fase 6 — Inicio y cotizaciones

La pantalla de inicio con "Libre este mes", y las cotizaciones automáticas de DolarApi que reemplazan la carga manual de la fase 3.

Tareas:

- Backend: modelo `ExchangeRate`, módulo `rates` con `RateProvider` y DolarApi, módulo `dashboard`.
- Los movimientos en dólares toman la cotización del día del tipo preferido (sin pedirla a mano), con opción de corregirla.
- Frontend: inicio igual al mockup (libre del mes, barra gastado / comprometido / libre, aviso de pendientes, próximos 30 días) y aviso cuando la cotización está desactualizada.

**Terminado cuando:** el inicio muestra "Libre este mes" con mis datos reales y la cotización MEP del día; si DolarApi no responde, se usa la última guardada y la app lo avisa.

```
Leé CLAUDE.md, el módulo 10 de docs/especificacion.md (DAS-01), la regla "Dinero y monedas", las secciones "Cotizaciones" y "Backend" de docs/arquitectura.md, y el mockup Inicio.

Vamos a hacer la Fase 6 de docs/plan.md: cotizaciones automáticas y la pantalla de inicio.

Backend:
1. Modelo ExchangeRate según la arquitectura, con su migración.
2. Módulo rates: interfaz RateProvider y una implementación para DolarApi (GET /v1/dolares, mapeando oficial → OFICIAL, blue → BLUE, bolsa → MEP). Upsert por fecha y tipo cuando no hay cotización del día o la última tiene más de una hora. Se dispara desde POST /sync y GET /rates/latest; no hay cron. Si la API falla, devolver la última guardada con stale: true.
3. Para valuar se usa el precio de venta. Un movimiento en moneda distinta a la base toma la cotización de esa fecha del tipo preferido del usuario (o la anterior más cercana); rateToBase en el request pasa a ser opcional y, si viene, manda.
4. Módulo dashboard: GET /dashboard?period= devuelve ingresos esperados, gastado, comprometido y libre del mes; cantidad y resumen de pendientes; próximos 30 días (vencimientos de resúmenes, fijos); y la cotización usada. Todo en moneda base con decimal.
5. Tests: provider mockeado (caso OK, caso caído con fallback), cálculo de libre del mes con un escenario armado.

Frontend:
1. /app igual al mockup Inicio: saludo, selector de mes, "Libre este mes" grande, pl-stacked-bar con gastado / comprometido / libre y su leyenda, aviso amarillo "Para confirmar" que lleva a la bandeja, lista de próximos 30 días.
2. Botón de ojo para ocultar montos en toda la app (estado global, persistido en localStorage).
3. Si la cotización viene stale, un aviso discreto con la fecha de la última.
4. En la carga rápida, mostrar la cotización que se va a usar cuando el monto es en otra moneda.

Forma de trabajo:
- Plan primero, esperá mi OK.
- Rama feat/fase-6-inicio. Todo en verde antes del PR, con capturas del inicio en celular, claro y oscuro.
```

## Fase 7 — Ahorros y metas

La pantalla de ahorros con el total valuado en dólares, y las metas conectadas a cuentas reales que calculan cuánto falta, cuánto ahorrar por mes y si vas a ritmo.

Tareas:

- Backend: modelos `Goal`, `GoalAccount`, `GoalContribution`; módulo `goals` con proyección y simulación.
- Frontend: Ahorros (total en USD, dólares y pesos, metas, cuentas de ahorro) y detalle de meta igual a los mockups, con el simulador de aporte.

**Terminado cuando:** creo la meta del auto con los datos del ejemplo y muestra 28 %, faltan USD 10.800 y USD 771 por mes; al cambiar el aporte simulado a USD 900 dice octubre 2027.

```
Leé CLAUDE.md, el módulo 8 de docs/especificacion.md (MET-01 a 03, y MET-04 si llegás), la regla "Metas", las secciones "Modelo de datos" y "Backend" de docs/arquitectura.md, y los mockups Ahorros y Meta de ahorro.

Vamos a hacer la Fase 7 de docs/plan.md: ahorros y metas.

Backend:
1. Modelos Goal, GoalAccount y GoalContribution según la arquitectura, con su migración.
2. Módulo goals: CRUD de metas; vincular y desvincular cuentas; aportes asignados (para repartir una cuenta entre varias metas); marcar cumplida o cancelada.
3. GET /goals y GET /goals/:id devuelven el acumulado (saldos de cuentas vinculadas convertidos a la moneda de la meta, o suma de aportes) y la proyección de goalProjection de libs/domain: faltante, meses restantes, aporte mensual, ritmo y monto esperado a hoy.
4. GET /goals/:id/projection?monthly= para el simulador: fecha estimada con ese aporte y cuántos meses antes o después del objetivo.
5. GET /savings: total ahorrado valuado en USD con la cotización preferida, separado en dólares y pesos, más las cuentas de tipo SAVINGS y CASH en USD.
6. Tests e2e con el ejemplo del auto de la especificación.

Frontend:
1. /app/ahorros igual al mockup: tarjeta oscura con el total, barra dólares/pesos, metas como tarjetas compactas (progreso, aporte mensual, fecha, etiqueta de ritmo) y cuentas de ahorro. Link a inversiones deshabilitado hasta la segunda tanda.
2. /app/metas/:id igual al mockup: anillo de progreso, ahorrado y faltante, aporte mensual necesario destacado, aviso de ritmo, simulador con input de aporte y cuentas vinculadas.
3. Alta y edición de meta, con selección de cuentas vinculadas.
4. pl-progress (barra y anillo) en libs/web-ui.

Forma de trabajo:
- Plan primero, esperá mi OK.
- Rama feat/fase-7-ahorros-metas. Todo en verde antes del PR, con capturas.
```

## Fase 8 — Landing y pulido del MVP

La cara pública de platin y una pasada de calidad sobre todo lo anterior. Al terminar esta fase, platin reemplaza a la app anterior.

Tareas:

- Landing prerenderizada: propuesta de valor ("Tu plata, más clara."), capturas de las pantallas, funcionalidades, llamado a registrarse.
- Metadatos: título, descripción, imagen para compartir, favicon e íconos del manifest a partir de los SVG.
- Onboarding mínimo: al registrarse, crear la primera cuenta y (opcional) la primera tarjeta.
- Pasada de calidad: estados vacíos, estados de carga y error, accesibilidad, modo oscuro en todas las pantallas, rendimiento en celular.

**Terminado cuando:** la landing está publicada, un usuario nuevo llega desde ahí, se registra y carga su primer gasto sin ayuda; Lighthouse en celular da 90 o más en accesibilidad y buenas prácticas.

```
Leé CLAUDE.md, el módulo 10 de docs/especificacion.md (LAN-01 y 02), la sección "Identidad visual y UX", la sección "Frontend" de docs/arquitectura.md, y usá los íconos de docs/brand/.

Vamos a hacer la Fase 8 de docs/plan.md: la landing de platin y el pulido final del MVP.

Landing (ruta /, prerenderizada):
1. Hero con el nombre, la frase "Tu plata, más clara.", una captura de la pantalla de inicio en un marco de celular y botones Ingresar / Crear cuenta.
2. Secciones: "Cuánto te queda libre este mes", "Tus cuotas, bajo control", "Metas que te dicen cuánto ahorrar", "Pesos y dólares, juntos". Cada una con su captura real de la app.
3. Paleta de platin: los acentos coral, celeste y rosa solo se usan acá.
4. Metadatos SEO y Open Graph, imagen para compartir, favicon e íconos del manifest generados desde docs/brand/icono-verde.svg.
5. Rápida en celular: imágenes optimizadas, fuentes con font-display: swap.

Onboarding:
6. Después del registro, un paso guiado: crear la primera cuenta (con su saldo actual) y, opcionalmente, la primera tarjeta. Se puede saltear.

Pulido:
7. Revisá todas las pantallas de /app: estados vacíos con pl-empty-state que expliquen qué cargar, estados de carga (skeletons) y de error con reintento.
8. Accesibilidad: navegación por teclado, foco visible, contraste AA (los textos chicos usan brand-strong, no brand), aria-labels en botones de ícono.
9. Modo oscuro revisado pantalla por pantalla.
10. Corré Lighthouse en celular sobre la landing y el inicio y corregí lo que baje de 90 en accesibilidad y buenas prácticas.

Forma de trabajo:
- Plan primero, esperá mi OK.
- Rama feat/fase-8-landing. Todo en verde antes del PR, con capturas de la landing y los resultados de Lighthouse.
```

## Iteración 2: lo que surgió al usar el MVP

Tres fases para resolver lo que apareció en los primeros días de uso: formularios incómodos, consumos que no se podían editar, categorías sin pantalla y un modelo de cuentas que no representaba las reservas. Van antes de la segunda tanda.

**Antes de empezar (vos):** volver a exportar la especificación, la arquitectura y este plan como Markdown y reemplazar los de `docs/` en el repo, en un commit a `main`. Las tres fases dependen de esa versión.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 9 | Formularios y arreglos: selector y fecha propios, editar consumos, pantalla de categorías | TAR-11, CAT-01 a 05 | No queda ningún `<select>` ni `<input type="date">` nativo y la fecha se elige bien en escritorio |
| 10 | Cuentas con apartados, con la base recreada desde cero | CTA-01 a 07, MOV-02 | Mercado Pago es una sola cuenta con sus reservas en pesos y dólares, y apartar plata son dos toques |
| 11 | Inversiones como apartados con valuación manual | INV-01 a 05 | Actualizo el valor de todas mis inversiones en una pantalla y veo el rendimiento de cada una |

## Fase 9 — Formularios y arreglos

Los arreglos que se notan todos los días, sin tocar el modelo de cuentas: un selector y un campo de fecha propios en toda la app, editar consumos de tarjeta y una pantalla para gestionar las categorías.

Tareas:

- `pl-date-field`: calendario propio en español con atajos Hoy y Ayer. Reemplaza a todos los `<input type="date">` (hoy fallan en escritorio porque el campo invisible no abre el selector).
- `pl-select` y `pl-category-select`: combobox con búsqueda, íconos, texto secundario y grupos; hoja inferior en celular. Reemplazan a los 14 `<select>` nativos.
- Editar y borrar consumos de tarjeta desde el detalle de la tarjeta y desde Movimientos (la API ya existe).
- Pantalla de categorías: crear, editar ícono y color, subcategorías, archivar y fusionar; categorías de sistema protegidas.

**Terminado cuando:** en escritorio y en celular elijo la fecha de un gasto sin problemas; ningún formulario tiene un `<select>` ni un `<input type="date">` nativo; corrijo el monto de un consumo en cuotas y se rehacen sus cuotas abiertas; creo una categoría propia y fusiono dos.

```
Leé CLAUDE.md, la sección "Identidad visual y UX > Formularios", TAR-11 y el módulo 11 (CAT-01 a 05) de docs/especificacion.md, y la tabla "Componentes base" de docs/arquitectura.md.

Vamos a hacer la Fase 9 de docs/plan.md: formularios y arreglos de la iteración 2. No toques el modelo de cuentas: eso es la fase 10.

1. pl-date-field en libs/web-ui
   - Hoy la fecha usa un <input type="date"> invisible encima de una etiqueta, y en escritorio no abre el selector. Reemplazalo por un componente propio: botón con la fecha en español ("Hoy", "Ayer" o "lunes 27 de octubre") que abre un calendario (overlay del CDK en escritorio, pl-bottom-sheet en celular).
   - Atajos Hoy y Ayer, navegación por mes, límites min y max, manejo completo con teclado.
   - ControlValueAccessor con LocalDate. Sin librerías de fechas nuevas salvo que me lo justifiques.

2. pl-select en libs/web-ui
   - Combobox accesible (patrón ARIA combobox + listbox) con búsqueda, ícono y color por opción, texto secundario, grupos y opción vacía opcional.
   - Overlay del CDK en escritorio y pl-bottom-sheet en celular. ControlValueAccessor.
   - pl-category-select: pl-select preconfigurado con las categorías activas del tipo indicado, con ícono y color, recientes primero.

3. Reemplazos
   - Buscá todos los <select> y <input type="date"> de apps/web y reemplazalos. Para cuentas usá pl-select con el saldo como texto secundario (en la fase 10 se cambia por pl-pocket-select).
   - Agregá una regla de lint o un test que falle si vuelve a aparecer un <select> o un <input type="date">.

4. Editar consumos (TAR-11)
   - La API ya tiene PATCH y DELETE /charges/:id. Agregá "Editar" y "Borrar" al tocar un consumo en el detalle de la tarjeta y en Movimientos, reutilizando charge-form-sheet en modo edición.
   - Si alguna cuota está en un resumen cerrado, solo se pueden editar descripción y categoría: la API debe aceptar ese caso parcial y rechazar el resto con CARD_STATEMENT_CLOSED, y la UI deshabilitar los campos con una explicación.

5. Categorías (CAT-01 a 05)
   - Backend: agregá systemKey a Category (ADJUSTMENT, YIELD) con su migración y creá las de sistema al registrarse; las de sistema no se pueden editar ni archivar. Agregá POST /categories/:id/merge con { targetId }: mueve movimientos, consumos, ajustes de resumen, fijos y presupuestos a la destino (mismo tipo) y archiva la original, en una transacción. Tests e2e, incluido el aislamiento entre usuarios.
   - Frontend: /app/categorias, accesible desde Más/Perfil. Lista por tipo con ícono, color y cantidad de usos; alta y edición con pl-icon-picker (lista curada de unos 40 íconos de Lucide) y pl-color-picker (tokens de la paleta); categoría padre opcional; archivar; fusionar con confirmación que dice cuántos movimientos se mueven.

Forma de trabajo:
- Plan primero, esperame. Si te parece grande, dividila en 9a (componentes y reemplazos) y 9b (consumos y categorías).
- Rama feat/fase-9-formularios. Lint, typecheck, tests y build en verde.
- En el PR, capturas de pl-select y pl-date-field en escritorio y celular, claro y oscuro.
```

## Fase 10 — Cuentas con apartados

El cambio de modelo: una cuenta por institución con sus apartados adentro, cada uno con su moneda y su propósito. La base se recrea desde cero y todo lo que hoy apunta a una cuenta pasa a apuntar a un apartado.

**Antes de empezar (vos):** aceptar que se pierden los datos cargados (los vas a volver a cargar con la estructura nueva) y tener a mano las credenciales de Neon para resetear la base.

Tareas:

- Esquema nuevo según la arquitectura: `Account` (institución) + `Pocket` (apartado), `pocketId` en movimientos, fijos y tarjetas, transferencias entre apartados, `GoalPocket` en lugar de `GoalAccount` y `GoalContribution`.
- Migraciones unificadas en una sola inicial y base reseteada en local y en Neon.
- `libs/domain`: `pocketBalance` y `accountTotals`, con tests.
- API: cuentas con apartados, endpoints de apartados, transferencias con intención (apartar, invertir, rescatar, mover) y todos los módulos actualizados.
- Web: pantalla de cuentas agrupada, detalle de cuenta y de apartado, acciones Apartar / Invertir / Rescatar, `pl-pocket-select` en toda la app.

**Terminado cuando:** cargo Mercado Pago como una sola cuenta con Disponible en pesos, Ahorro en pesos, Ahorro en dólares e Inversión largo plazo; aparto $ 100.000 en dos toques y los saldos cambian; un gasto en la carga rápida sale del Disponible; la meta del auto se vincula al Ahorro en dólares.

```
Leé CLAUDE.md, el módulo 2 (CTA-01 a 07) y la regla "Cuentas y apartados" de docs/especificacion.md, y las secciones "Modelo de datos" (incluido "Reinicio de la base") y "Backend" de docs/arquitectura.md.

Vamos a hacer la Fase 10 de docs/plan.md: reemplazar las cuentas planas por cuentas con apartados. Es un cambio de esquema grande y la base se recrea desde cero: no hay que migrar datos.

Esquema y base:
1. Actualizá schema.prisma exactamente como la arquitectura: Account (institución), Pocket (apartado), Transaction.pocketId, Transfer.fromPocketId/toPocketId, CreditCard.defaultPaymentPocketId, FixedItem.pocketId, GoalPocket. Eliminá GoalAccount y GoalContribution. PocketValuation y los tipos YIELD/VALUATION quedan en el esquema pero se usan en la fase 11.
2. Borrá apps/api/prisma/migrations y generá una única migración inicial. Agregá en SQL las check constraints: Transfer con exactamente un destino, Pocket.instrument solo si kind = INVESTMENT, FixedItem con exactamente uno de pocketId o cardId.
3. Dejá un ADR que explique el cambio y que las migraciones anteriores se descartaron.
4. Escribime en el PR los pasos exactos para resetear la base de Neon y desplegar.

Dominio:
5. pocketBalance(initial, transactions, transfers, at?) y accountTotals(pockets) en libs/domain, con tests (transferencia entre monedas dentro de la misma cuenta, ajuste negativo, apartado archivado).

API:
6. accounts: GET /accounts devuelve cada cuenta con sus apartados y saldos y los totales por moneda. Al crear una cuenta se crea su apartado "Disponible" en ARS. POST /accounts/:id/pockets, PATCH /pockets/:id, GET /pockets/:id, GET /pockets/:id/transactions, POST /pockets/:id/adjust. Archivar solo con saldo 0 (POCKET_NOT_EMPTY).
7. transfers: entre apartados de cualquier cuenta, con intent SAVE, INVEST, REDEEM o MOVE (solo informativo, para mostrar "Apartaste", "Invertiste"...). Con monedas distintas exige los dos montos.
8. Actualizá transactions, cards (pago de resumen desde un apartado), fixed, goals (vincular apartados; acumulado = suma de saldos de los apartados vinculados), dashboard y savings para usar apartados.
9. Onboarding al registrarse: categorías sugeridas y de sistema, y la cuenta "Efectivo" con su Disponible en ARS.
10. Tests e2e de todos los módulos afectados, incluido el aislamiento entre usuarios con apartados.

Web:
11. /app/cuentas: cada cuenta como tarjeta con sus apartados agrupados (ícono según tipo: disponible, ahorro, inversión), saldo de cada uno y total de la cuenta por moneda; arriba el total general.
12. /app/cuentas/:id: apartados, "+ Apartado" (nombre, moneda, tipo y, si es inversión, instrumento) y acciones rápidas Apartar, Invertir y Rescatar: una hoja con origen, destino (filtrados por tipo) y monto; si las monedas difieren, los dos montos y la cotización resultante.
13. /app/apartados/:id: movimientos del apartado, evolución del saldo, ajustar saldo, editar, archivar.
14. pl-pocket-select en libs/web-ui: apartados agrupados por cuenta con moneda y saldo, filtrables por tipo y moneda. Reemplazá con él los selectores de cuenta de la fase 9. En la carga rápida se preselecciona el último apartado usado.
15. Actualizá onboarding, metas (vincular apartados), ahorros (apartados de ahorro e inversión) y pago de resumen.

Forma de trabajo:
- Plan primero, esperame. Esta fase conviene dividirla: 10a esquema, dominio y API; 10b web.
- Rama feat/fase-10-apartados. Todo en verde antes del PR, con capturas de Cuentas y del detalle de una cuenta.
```

## Fase 11 — Inversiones

Las inversiones como apartados con valuación manual: una pantalla para actualizar todos los valores de una vez (a principio de mes) y el rendimiento de cada una registrado como movimiento.

Tareas:

- `PocketValuation` y movimientos `YIELD` con la categoría de sistema Rendimientos.
- `libs/domain`: `yieldFromValuation` e `investmentSummary`, con tests.
- API: módulo `investments` con resumen, carga de valuaciones en lote y borrado de la última.
- Web: pantalla de Inversiones, pantalla "Actualizar valores" y aviso en el inicio si pasó más de un mes.
- Los rendimientos no cuentan en "Libre este mes" ni en ingresos; sí en el patrimonio.

**Terminado cuando:** con un apartado de CEDEARs donde invertí $ 500.000, cargo un valor de $ 540.000 y veo un rendimiento de $ 40.000 (8 %); el saldo del apartado pasa a $ 540.000 y "Libre este mes" no cambia.

```
Leé CLAUDE.md, el módulo 9 (INV-01 a 05) y la regla "Inversiones" de docs/especificacion.md, y las secciones "Modelo de datos" y "Backend" de docs/arquitectura.md. Mirá también el mockup de Inversiones en docs/mockups/, que hay que adaptar a apartados.

Vamos a hacer la Fase 11 de docs/plan.md: inversiones como apartados con valuación manual.

Dominio:
1. yieldFromValuation(balanceAt, value) e investmentSummary(pocket, transfers, yields) en libs/domain: invertido neto (entradas − salidas), valor actual, rendimiento acumulado (monto y % sobre invertido neto) y rendimiento del último período. Tests con el ejemplo del criterio de terminado, rendimiento negativo y un rescate parcial.

API:
2. Módulo investments:
   - GET /investments: apartados de tipo INVESTMENT agrupados por cuenta con su resumen, totales por moneda y valuados en moneda base, y la fecha de la última actualización.
   - POST /investments/valuations en lote: [{ pocketId, date, value }]. Por cada uno, calcula el saldo a esa fecha, crea la PocketValuation y un Transaction YIELD con la diferencia (con signo; si es 0, no crea movimiento), con la categoría de sistema Rendimientos y origin VALUATION. Todo en una transacción. Una valuación por apartado y fecha.
   - DELETE /valuations/:id: solo la última de su apartado; borra también su movimiento.
3. Excluir YIELD de "Libre este mes", de ingresos del mes y de presupuestos; incluirlo en saldos y patrimonio. Agregá tests que lo verifiquen en dashboard.
4. Tests e2e del módulo, incluido el aislamiento entre usuarios.

Web:
5. /app/inversiones: adaptá el mockup. Arriba, valor actual total con rendimiento acumulado y composición por instrumento; abajo, los apartados de inversión agrupados por cuenta con invertido, valor y rendimiento. Botón "Actualizar valores".
6. /app/inversiones/actualizar: lista de todos los apartados de inversión con su último valor y fecha y un campo para el valor actual; muestra en vivo la diferencia; un solo botón guarda todo. Los que se dejan vacíos no se actualizan.
7. En el detalle de un apartado de inversión, el historial de valuaciones y rendimientos, y "Deshacer última actualización".
8. En el inicio, si pasó más de un mes desde la última actualización, un aviso discreto que lleva a "Actualizar valores".
9. Habilitá el link a Inversiones desde Ahorros.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-11-inversiones. Todo en verde antes del PR, con capturas de Inversiones y de Actualizar valores.
```

## Iteración 3: identidad, administración y planes

Tres fases para darle a platin forma de producto. Se numeran de la 17 a la 19 para no mover la segunda tanda, pero pueden hacerse antes que ella. La 17 es independiente; la 19 necesita la 18.

**Antes de empezar (vos):** exportar el artboard "Landing · A + C" del canvas de mockups (la dirección elegida: hero de C con el guiño de A, preguntas como títulos y el cierre de A) como imagen a `docs/mockups/landing/`; volver a exportar los tres documentos a `docs/`.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 17 | Landing nueva con la dirección elegida | LAN-01, 02 | La landing publicada se parece al mockup elegido, con su movimiento, y Lighthouse en celular da 90 o más |
| 18 | Administrador: panel, usuarios, configuración y auditoría | ADM-01 a 07 (sin planes) | Entro con mi email de admin, veo las métricas y suspendo y reactivo un usuario de prueba, y todo queda en la auditoría |
| 19 | Planes con límites, sin cobro | PLN-01 a 06, ADM-06 | Un usuario Gratis que llega al límite de cuentas puede pedir Pro; lo apruebo desde el panel y puede crear la cuenta |

## Fase 17 — Landing nueva

Reemplaza la landing actual por la dirección elegida en el canvas: más marca, más visual y un movimiento principal.

**Terminado cuando:** la landing publicada se parece al mockup elegido en escritorio y celular, el movimiento principal funciona y se detiene con "reducir movimiento", y Lighthouse en celular da 90 o más en rendimiento, accesibilidad y buenas prácticas.

```
Leé CLAUDE.md, LAN-01 y las secciones "Identidad visual y UX" (incluida "Landing") de docs/especificacion.md. La referencia visual es la imagen de docs/mockups/landing/ y los íconos de docs/brand/ (el guiño es glifo-guino.svg).

Vamos a hacer la Fase 17 de docs/plan.md: reemplazar la landing actual por la nueva dirección visual.

1. Reconstruí apps/web/src/app/landing siguiendo el mockup: misma estructura de secciones, jerarquía tipográfica, colores y textos (los textos van en landing.texts.ts). Usá los tokens de Tailwind; los acentos coral, celeste y rosa se habilitan solo para la landing.
2. El guiño como componente reutilizable (pl-wink en libs/web-ui) con una entrada opcional para animar el parpadeo; usalo también en la pantalla "Despertando el servidor" y en el favicon y los íconos del manifest (desde icono-guino.svg).
3. Un solo movimiento principal, con CSS (sin librerías de animación): el que muestra el mockup. Todo queda quieto con prefers-reduced-motion. Nada de animaciones de entrada en cada sección.
4. Responsive real: a 390 px de ancho no hay scroll horizontal (salvo cintas o tiras pensadas para desplazarse), los titulares escalan con clamp() y los botones tienen 44 px de alto como mínimo.
5. Sigue prerenderizada. Actualizá metadatos, imagen para compartir y Open Graph con la identidad nueva.
6. Corré Lighthouse en celular y corregí hasta llegar a 90 o más en rendimiento, accesibilidad y buenas prácticas.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-17-landing. Todo en verde antes del PR, con capturas en escritorio y celular, un GIF o video corto del movimiento y los resultados de Lighthouse.
```

## Fase 18 — Administrador

Rol de administrador, panel con métricas agregadas, gestión de usuarios, configuración global y auditoría. Sin planes todavía: eso es la fase 19.

**Antes de empezar (vos):** definir `ADMIN_EMAILS` con tu email en Render y en tu `.env` local, y crear un segundo usuario de prueba.

**Terminado cuando:** entro con mi email y veo el panel; un usuario común no puede abrir `/admin` ni llamar a `/api/v1/admin/*`; suspendo al usuario de prueba, no puede ingresar, lo reactivo y las dos acciones están en la auditoría; publico un aviso y lo ven todos los usuarios.

```
Leé CLAUDE.md, el módulo 13 (ADM-01 a 05 y ADM-07) y la regla "Administración" de docs/especificacion.md, y la sección "Administración y planes" de docs/arquitectura.md.

Vamos a hacer la Fase 18 de docs/plan.md: el usuario administrador. No implementes planes ni límites (fase 19), pero dejá el panel preparado para sumar las secciones Planes y Solicitudes.

Privacidad (no negociable): el administrador nunca ve montos, saldos, movimientos, descripciones, categorías ni nombres de cuentas de un usuario. Solo datos de cuenta y conteos.

Backend:
1. Esquema: role, status y lastSeenAt en User; AppSetting, AuditLog y ActivityDay, según la arquitectura. Migración.
2. ADMIN_EMAILS (variable de entorno, sumala a .env.example y a la tabla de variables de docs/arquitectura.md): al ingresar, un email de la lista pasa a ADMIN. Claim role en el JWT. RolesGuard('ADMIN') que verifica el rol en la base en cada pedido.
3. Middleware que registra ActivityDay y lastSeenAt como máximo una vez por usuario y día.
4. Módulo admin con: GET /admin/metrics (usuarios totales, activos 7 y 30 días, altas por semana de las últimas 12, usuarios que usan cada funcionalidad), GET /admin/users con búsqueda, filtros y cursor, GET /admin/users/:id (datos de cuenta y conteos por tipo de registro), POST suspend, reactivate y logout, DELETE del usuario con todos sus datos (requiere { confirmEmail }), GET/PUT /admin/settings/:key (registro abierto, aviso global con texto y fechas, categorías sugeridas, cotización por defecto) y GET /admin/audit.
5. Cada escritura de admin y su AuditLog en la misma transacción. El admin no puede suspenderse a sí mismo.
6. Suspender revoca todos los refresh tokens; el login de un suspendido responde ACCOUNT_SUSPENDED. Con el registro cerrado, POST /auth/register responde REGISTRATION_CLOSED.
7. GET /announcements/current (usuario logueado) devuelve el aviso vigente.
8. El módulo admin no importa ningún módulo financiero. Tests e2e: acceso denegado a usuarios comunes, auditoría de cada acción, suspensión, borrado, y un test que recorre todas las respuestas de /admin y falla si encuentra campos de montos o nombres de cuentas.

Web:
9. /admin con carga diferida, guard por rol y layout de escritorio con barra lateral: Resumen, Usuarios, Configuración, Auditoría (y lugar para Planes y Solicitudes).
10. Resumen: tarjetas de métricas y un gráfico simple de altas por semana. Usuarios: tabla con búsqueda y filtros, detalle con acciones y confirmaciones. Configuración: un formulario por clave. Auditoría: lista cronológica.
11. En la app, el aviso global arriba del contenido, descartable por sesión. Link a /admin en el menú Más solo para administradores.

Forma de trabajo:
- Plan primero, esperame. Si conviene, dividí en backend y web.
- Rama feat/fase-18-admin. Todo en verde antes del PR, con capturas del panel.
```

## Fase 19 — Planes con límites

Planes definidos desde el panel, límites que se respetan en toda la app, solicitudes de cambio de plan y una página pública de planes. Sin cobro, pero con el lugar listo para sumarlo.

**Terminado cuando:** un usuario nuevo queda en Gratis; con el límite de cuentas alcanzado, al intentar crear otra ve cuál es el límite y pide Pro; apruebo la solicitud desde el panel y puede crearla; si le asigno Pro por 30 días, al vencer vuelve a Gratis sin perder datos.

```
Leé CLAUDE.md, el módulo 12 (PLN-01 a 06), ADM-06 y la regla "Planes" de docs/especificacion.md, y la sección "Administración y planes" de docs/arquitectura.md.

Vamos a hacer la Fase 19 de docs/plan.md: planes con límites, asignados por el administrador y sin cobro.

Dominio:
1. checkLimit(limits, resource, used) y resolveCurrentPlan(userPlans, defaultPlan, now) en libs/domain, con tests: límite null = ilimitado, en el límite no se puede crear, archivados no cuentan, plan vencido vuelve al por defecto.

Backend:
2. Esquema: Plan, UserPlan y PlanRequest según la arquitectura, con el índice único parcial de isDefault en SQL. La migración crea "Gratis" (por defecto) y "Pro"; proponé límites iniciales razonables y preguntame antes de fijarlos.
3. Al registrarse, UserPlan con el plan por defecto (source DEFAULT).
4. EntitlementsService.assertCanCreate(userId, resource) llamado desde los servicios que crean cuentas, apartados, tarjetas, metas y fijos; @RequiresFeature('investments') en los endpoints de inversiones. Errores PLAN_LIMIT_REACHED y FEATURE_NOT_IN_PLAN con { resource, limit, used }.
5. GET /me/plan, GET /plans (público), POST /plan-requests.
6. Admin: CRUD de planes (PLN-01), plan por defecto, POST /admin/users/:id/plan con vencimiento opcional (PLN-06), GET /admin/plan-requests, approve y reject (ADM-06). Todo con auditoría. Sumá usuarios por plan a las métricas.
7. Tests e2e: límite alcanzado en cada recurso, funcionalidad deshabilitada, bajar de plan sin perder datos (se edita lo existente pero no se crea), vencimiento, flujo completo de solicitud.

Web:
8. Store de plan con GET /me/plan. Ante PLAN_LIMIT_REACHED o FEATURE_NOT_IN_PLAN, una hoja que explica el límite ("Tu plan Gratis incluye 2 cuentas") y permite pedir otro plan. Las funcionalidades fuera del plan se ocultan del menú.
9. Perfil: sección "Tu plan" con el uso de cada límite y el vencimiento, si tiene.
10. /planes pública y prerenderizada, con la identidad de la landing nueva, que lee GET /plans; link desde la landing y el perfil.
11. Panel: secciones Planes (editar límites, funcionalidades, precio de referencia, visibilidad y orden) y Solicitudes, y el cambio de plan en el detalle de usuario.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-19-planes. Todo en verde antes del PR, con capturas de la hoja de límite, /planes y el panel de planes.
```

## Fase 20 — Ingreso con Google

Ingreso y registro con Google sobre una estructura que admite más proveedores. Es independiente de las fases 17 a 19 y puede hacerse en cualquier momento; si la 18 ya está hecha, respeta la suspensión y el registro cerrado.

**Antes de empezar (vos):**

1. En [Google Cloud Console](https://console.cloud.google.com/), crear un proyecto "platin".
2. Configurar la pantalla de consentimiento: tipo Externo, nombre platin, tu email de soporte y los scopes `openid`, `email` y `profile`. Con solo esos scopes no hace falta verificación.
3. Crear credenciales "ID de cliente de OAuth" de tipo "Aplicación web" con dos URI de redireccionamiento autorizadas:
   - `http://localhost:4200/api/v1/auth/oauth/google/callback`
   - `https://<tu-app>.vercel.app/api/v1/auth/oauth/google/callback`
4. Guardar el ID y el secreto en Render y en tu `.env` local como `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Definir también `PUBLIC_APP_URL` (la URL de Vercel en Render, `http://localhost:4200` en local) y `OAUTH_COOKIE_SECRET` (un valor aleatorio largo).

**Terminado cuando:** en local y en producción creo una cuenta con Google y la segunda vez ingreso a la misma; si ya tengo cuenta con contraseña y ese email, la app me pide ingresar con la contraseña y vincular Google desde el perfil, y después puedo ingresar de las dos formas; no puedo desvincular mi última forma de ingreso; sin las variables de Google, el botón no aparece.

```
Leé CLAUDE.md, AUTH-06 a 08 y la regla "Ingreso con proveedores" de docs/especificacion.md, y la sección "Auth y seguridad > Ingreso con proveedores externos" de docs/arquitectura.md.

Vamos a hacer la Fase 20 de docs/plan.md: ingreso con Google sobre una estructura preparada para sumar Facebook y Apple después. Implementá solo Google; no dejes código a medias de los otros proveedores, pero sí el enum y la interfaz listos para ellos.

Backend:
1. Esquema: AuthProvider, AuthIdentity y passwordHash opcional en User, según la arquitectura. Migración. El login con contraseña debe rechazar con el mismo error genérico de credenciales inválidas a una cuenta sin contraseña.
2. Interfaz OAuthProvider, GoogleProvider con openid-client (descubrimiento OIDC, PKCE, state y nonce, verificación del id_token) y OAuthProviderRegistry que habilita un proveedor solo si sus variables de entorno están definidas.
3. Endpoints de la tabla de la arquitectura: GET /auth/providers, start y callback, link-ticket, GET y DELETE /auth/identities, POST /auth/password.
4. Cookie oauth_tx firmada con OAUTH_COOKIE_SECRET, httpOnly, Secure (salvo en local), SameSite=Lax, Path=/api/v1/auth/oauth, 10 minutos; se borra en el callback. La dirección de retorno sale de PUBLIC_APP_URL, nunca del host del pedido. returnTo solo acepta rutas internas que empiecen con "/" (sin "//"), para no permitir redirecciones abiertas.
5. Resolución del usuario exactamente como la regla de la especificación: identidad existente; cuenta nueva con el mismo onboarding que el registro; o ACCOUNT_EXISTS_LINK_REQUIRED si el email ya tiene cuenta. Solo emails verificados por Google. Respetá ACCOUNT_SUSPENDED y REGISTRATION_CLOSED si existen.
6. El callback emite la misma sesión que POST /auth/login y redirige a /auth/listo?returnTo=...; los errores redirigen a /ingresar?error=CODE. Ningún token en la URL. Cache-Control: no-store en todo /auth/*.
7. Sumá las variables nuevas a .env.example, a la validación de configuración y a la tabla de variables de docs/arquitectura.md.
8. Tests: unitarios de la resolución de usuario y de la validación de returnTo; e2e del flujo completo con un GoogleProvider falso inyectado (sin llamar a Google): cuenta nueva, segundo ingreso, email existente, state inválido, vincular con ticket, ticket vencido o reusado, desvincular el último método, definir contraseña.

Web:
9. En /ingresar y /registro, un botón "Continuar con Google" por cada proveedor de GET /auth/providers, siguiendo las pautas de marca de Google (logo oficial, texto y colores permitidos), con un separador "o" antes del formulario de email.
10. Página /auth/listo: llama a /auth/refresh, ejecuta el arranque habitual (sync) y navega a returnTo.
11. Mensajes de error en /ingresar según el código, en español: por ejemplo, para ACCOUNT_EXISTS_LINK_REQUIRED, "Ya tenés una cuenta con ese email. Ingresá con tu contraseña y vinculá Google desde tu perfil."
12. Perfil, sección "Formas de ingreso": contraseña (definir si no tiene) y proveedores con vincular y desvincular; desvincular el último método está deshabilitado con la explicación.

Forma de trabajo:
- Plan primero, esperame. Confirmá en el repo el puerto del front en local antes de dar por buena la URI de retorno.
- Rama feat/fase-20-google. Todo en verde antes del PR, con capturas del login y del perfil, y los pasos para probarlo en local con mis credenciales.
```

## Iteración 4: lo que surgió del uso diario

Tres fases para lo que se notó al usar la app con datos reales. Son independientes entre sí; las ordeno por impacto en el uso diario y por tamaño.

**Antes de empezar (vos):** volver a exportar los tres documentos a `docs/`.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 21 | Plan visible, accesos del inicio y categorías sin salir de la carga | PLN-07, DAS-04, CAT-06 | Veo "Pro" antes de tocar algo que no incluye mi plan, personalizo los accesos del inicio y creo una categoría mientras cargo un gasto |
| 22 | Tarjetas: carga por valor de cuota, historial y fijos en tarjeta | TAR-02, 09, 12, 13 | Cargo una compra con la cuota del resumen, veo resúmenes anteriores y mis compras, y mi suscripción se carga sola cada mes |
| 23 | Varias monedas | MON-01 a 05 | Activo el euro, creo un apartado en euros, compro euros con pesos y el total general lo incluye valuado |

## Fase 21 — Plan visible, accesos y categorías

Tres mejoras de uso en el front, con poco backend: que el plan avise antes, que el inicio lleve a todas las funciones y que no haya que salir de la carga para crear una categoría.

**Terminado cuando:** con el plan Gratis veo la marca "Pro" en "Inversiones" y en "+ Apartado de inversión" antes de tocarlos, y al tocarlos se abre la explicación sin empezar el formulario; veo "2 de 2 cuentas" junto a "Nueva cuenta"; elijo y ordeno mis accesos del inicio y se mantienen en otro dispositivo; creo una categoría desde la carga rápida y queda elegida sin perder el monto.

```
Leé CLAUDE.md, PLN-07, DAS-04 y CAT-06 de docs/especificacion.md, y la tabla "Componentes y patrones de la iteración 4" de docs/arquitectura.md.

Vamos a hacer la Fase 21 de docs/plan.md.

Plan visible (PLN-07):
1. Sumá a PlanStore can(feature) y remaining(resource), a partir de GET /me/plan.
2. Creá la directiva plPlanGate y los componentes pl-plan-badge y pl-usage en libs/web-ui (o en apps/web si dependen del store; justificá dónde).
3. Recorré toda la app y marcá cada acción, opción y acceso limitado por el plan: crear cuentas, apartados, tarjetas, metas y fijos (con su uso), el tipo "Inversión" en el formulario de apartado, Inversiones en el menú y en los accesos, y la intención "Invertir". Armá primero la lista y mostrámela.
4. Tocar algo marcado abre la hoja del plan existente, sin abrir el formulario. El interceptor de errores de plan se queda como respaldo.

Accesos del inicio (DAS-04):
5. Backend: preferences Json en User con su migración, y preferences.homeShortcuts en PATCH /users/me, validado con Zod contra la lista de accesos posibles (sin duplicados, máximo 8).
6. Web: fila de accesos en el inicio, debajo de "Libre este mes", con ícono y nombre, y el conjunto por defecto (Cuentas, Tarjetas, Fijos, Compromisos, Ahorros, Inversiones, Categorías). Botón "Editar" que permite agregar, quitar y ordenar (arrastrar en escritorio, subir y bajar en celular). Los accesos fuera del plan llevan su marca.

Categorías sin salir (CAT-06):
7. pl-category-select con allowCreate: "+ Nueva categoría" al final de la lista, con el texto de la búsqueda como nombre inicial. Abre el formulario de categoría existente en una hoja encima; al guardar, la nueva queda elegida.
8. Activalo en todos los selectores de categoría (movimientos, fijos, consumos, cierre de resumen).
9. Carga rápida: se mantienen los chips de recientes y el selector con allowCreate reemplaza a "Ver todas". Lo cargado (monto, cuenta, fecha) no se pierde.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-21-plan-accesos-categorias. Todo en verde antes del PR, con capturas de las marcas "Pro", el inicio editando accesos y la creación de categoría desde la carga rápida.
```

## Fase 22 — Tarjetas: cuotas, historial y fijos

Tres agregados para que las tarjetas se entiendan mejor: cargar la cuota como la muestra el banco, ver lo que ya pasó y que las suscripciones se carguen solas.

**Terminado cuando:** cargo una compra de 12 cuotas de $ 45.833,33 y el total es $ 549.999,96; veo la lista de resúmenes cerrados de mi Visa y entro a uno anterior; veo todas mis compras con tarjeta, filtro las que siguen activas y busco por descripción; creo un fijo de USD 9,99 en mi Visa y al sincronizar aparece como consumo en el resumen que corresponde, una sola vez.

```
Leé CLAUDE.md, TAR-02, TAR-09, TAR-12 y TAR-13 de docs/especificacion.md, las reglas "Cuotas" y "Fijos y movimientos pendientes", y la sección "Iteración 4: monedas, preferencias y tarjetas" de docs/arquitectura.md.

Vamos a hacer la Fase 22 de docs/plan.md.

Carga por valor de cuota (TAR-02):
1. createChargeRequestSchema acepta exactamente uno de totalAmount o installmentAmount. El servicio calcula el total como cuota × cantidad; con valor de cuota, todas las cuotas valen exactamente eso. Tests en libs/domain y e2e.
2. En el formulario de consumo, un segmentado "Total" / "Por cuota" junto al monto, que muestra el otro valor calculado en vivo. Por defecto "Total"; si se elige más de una cuota, recordar el último modo usado.

Historial (TAR-12, TAR-13):
3. GET /cards/:id/statements?status=closed&cursor= para el historial de resúmenes, y GET /charges con filtros por tarjeta, fechas, texto y estado (activo o terminado: terminó cuando su última cuota está en un resumen cerrado), con cursor. Tests e2e con aislamiento entre usuarios.
4. En el detalle de la tarjeta, la pestaña "Resumen" pasa a "Resúmenes": el abierto arriba y debajo los anteriores (período, totales, estado y pagos), cada uno con su detalle de consumos, cuotas, ajustes y pagos.
5. Una pantalla "Compras" por tarjeta (y una general desde Tarjetas) con búsqueda, filtro de estado y fechas, mostrando total, cuota y "4 de 12". Tocar una compra abre su detalle con edición.

Fijos en tarjeta (TAR-09):
6. El formulario de fijos permite elegir una tarjeta en lugar de un apartado (con pl-currency-select en modo cardOnly).
7. POST /sync crea, por cada fijo en tarjeta y período vencido, un consumo de un pago con su monto vigente, fechado el día del fijo, en el resumen que le corresponde, en la misma transacción e idempotente por (fixedId, fixedPeriod). No genera pendientes. Tests: idempotencia con sync en paralelo, cambio de monto desde un período y fijo en pausa.
8. En la lista de compras, los consumos que vienen de un fijo llevan una marca "Fijo".

Forma de trabajo:
- Plan primero, esperame. Si conviene, dividila en 22a (cuotas e historial) y 22b (fijos en tarjeta).
- Rama feat/fase-22-tarjetas. Todo en verde antes del PR, con capturas del formulario, del historial de resúmenes y de la lista de compras.
```

## Fase 23 — Varias monedas

Euro, real, peso chileno y peso uruguayo en toda la app, con cotización automática, sin cambiar las tarjetas.

**Terminado cuando:** activo el euro en el perfil; creo un apartado en euros en Mercado Pago; compro € 100 con pesos y la cotización mostrada es coherente; el total general incluye los euros valuados en la moneda base; una meta en euros calcula su aporte mensual; no puedo desactivar el euro mientras el apartado esté activo; las tarjetas siguen ofreciendo solo pesos y dólares.

```
Leé CLAUDE.md, el módulo 14 (MON-01 a 05) y la regla "Dinero y monedas" (incluido "Varias monedas") de docs/especificacion.md, y en docs/arquitectura.md las secciones "Iteración 4: monedas, preferencias y tarjetas" y "Cotizaciones" (incluido "Otras monedas").

Vamos a hacer la Fase 23 de docs/plan.md: varias monedas. Es un cambio transversal: antes de tocar código, buscá en todo el monorepo los lugares que asumen ARS y USD (enums, contratos con campos Ars/Usd, totales, formateo, selectores, tests) y mostrame la lista con lo que vas a hacer en cada uno.

Dominio y contratos:
1. Currency con ARS, USD, EUR, BRL, CLP y UYU; CardCurrency con ARS y USD. convert(money, to, rates) para cualquier par, cruzando por el peso; el tipo preferido (oficial, MEP, blue) solo para el dólar. formatMoney con el símbolo de cada moneda (€, R$, CLP, UYU). Tests de conversiones cruzadas y de redondeo.
2. Los totales por moneda pasan de campos fijos a listas { currency, amount }[] en los contratos que corresponda. Si cambia la forma de una respuesta, actualizá el front en el mismo PR.

Backend:
3. Migración: enum ampliado, User.currencies, ExchangeRate.currency con la clave única nueva, y check constraints de moneda de tarjeta en SQL. Las filas existentes de ExchangeRate quedan como USD.
4. rates: pedir también GET /v1/cotizaciones de DolarApi y guardar EUR, BRL, CLP y UYU con tipo OFICIAL. El fallback a la última cotización guardada funciona por moneda.
5. Validar en cada servicio que la moneda de un apartado, movimiento, transferencia, fijo, meta o inversión esté activada para el usuario (CURRENCY_NOT_ENABLED), y que las de tarjeta sean ARS o USD.
6. PATCH /users/me con currencies: ARS y la moneda base siempre activadas; desactivar una en uso responde CURRENCY_IN_USE.
7. Revisá dashboard, savings, investments, commitments y goals para que valoricen cualquier moneda en la moneda base.
8. Tests e2e: el escenario del criterio de terminado, y una transferencia EUR → USD.

Web:
9. Perfil: sección "Monedas" con las seis y su estado, explicando por qué una no se puede desactivar.
10. pl-currency-select (monedas activadas, o solo ARS y USD con cardOnly) en todos los formularios con moneda.
11. Totales por moneda en Cuentas, Ahorros e Inversiones: una línea por moneda con saldo, y el total valuado.

Forma de trabajo:
- Plan primero, esperame. Si conviene, dividila en 23a (dominio, contratos y backend) y 23b (web).
- Rama feat/fase-23-monedas. Todo en verde antes del PR, con capturas del perfil, de un apartado en euros y de los totales.
```

## Iteración 5: que todo cierre

Tres fases para que cada peso esté en un solo lugar y los números de una pantalla coincidan con los de otra. La 24 va primero porque cambia cómo se lee el inicio; la 25 y la 26 son independientes. La 27 y la 28 se sumaron después y tampoco dependen de las otras.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 24 | Invertir desde la carga, ajuste explicado y libre que descuenta lo separado | MOV-07, CTA-06, DAS-05 | Compro CEDEARs desde el +, el Disponible baja, la inversión sube, el patrimonio no cambia y "Libre este mes" baja lo mismo |
| 25 | Gastos programados y compromisos que cierran | MOV-08, COM-01, 02 | Cargo un turno médico para el 20, lo veo en Compromisos y en el inicio sin que toque mi saldo, y el comprometido de un mes es el mismo en las dos pantallas |
| 26 | Cambiar el apartado al editar y valores en los gráficos | MOV-04, DAS-06 | Paso un gasto de Galicia a Mercado Pago y veo el monto exacto de cualquier barra con mouse, teclado o dedo |
| 27 | Empezar de cero | AUTH-09 | Borro todos mis datos desde el perfil, mantengo mis categorías y quedo como un usuario nuevo sin perder mi ingreso con Google ni mi plan |
| 28 | Cuota en el resumen que falta pagar | TAR-03 | Entre el cierre y el vencimiento cargo "voy por la 3 de 9" en el resumen que vence el 5/11 y Compromisos de noviembre lo incluye |

## Fase 24 — Invertir y saldos con sentido

Comprar una inversión es mover plata, no ganarla: el Disponible baja, la inversión sube y el patrimonio queda igual. Ajustar saldo y Actualizar valor quedan para lo que no es un movimiento (intereses, ganancias, diferencias).

**Terminado cuando:** desde el + elijo "Invertir", $ 150.000 desde el Disponible de Galicia a "CEDEARs" y en la lista dice "Invertiste $ 150.000 en CEDEARs"; el Disponible bajó $ 150.000, CEDEARs subió $ 150.000 y el patrimonio no cambió; creo una inversión nueva sin salir de la carga; rescato $ 50.000 y vuelve al Disponible; un apartado de inversión ya no ofrece "Ajustar saldo" y "Actualizar valor" explica para qué sirve con atajos a Invertir y Rescatar; el ejemplo de "Libre este mes" de la especificación da $ 370.000 y $ 400.000; la barra del inicio muestra "Ahorrado/Invertido".

```
Leé CLAUDE.md; MOV-07, CTA-06 y DAS-05 y las reglas "Cuentas y apartados", "Inversiones" y "Libre este mes" de docs/especificacion.md; y en docs/arquitectura.md la sección "Iteración 5: invertir, programados y compromisos" y la tabla "Componentes y patrones de la iteración 5".

Vamos a hacer la Fase 24 de docs/plan.md.

Dominio:
1. separatedThisMonth(transfers, pocketKinds, base) en libs/domain: suma en moneda base las transferencias de AVAILABLE a SAVINGS o INVESTMENT y resta las inversas; las demás no cuentan. freeThisMonth suma el parámetro separated. Los dos ejemplos de la regla "Libre este mes" son tests literales, más los casos de transferencia entre Disponibles, entre Ahorro e Inversión y entre monedas.

Backend:
2. GET /dashboard agrega separated (contrato incluido) y lo descuenta de free. Usá baseAmount congelado de cada transferencia; si una transferencia entre monedas no lo tiene, decime cómo se valúa hoy antes de elegir.
3. POST /pockets/:id/adjust sobre un apartado INVESTMENT responde USE_VALUATION (Problem Details). Test e2e.
4. GET /movements acepta type=INVESTMENT: transferencias con intent INVEST o REDEEM. Test e2e con aislamiento entre usuarios.

Web:
5. Carga rápida: cuarto segmento "Invertir" con un toggle "Invertir" / "Rescatar". Invertir: origen por defecto el Disponible del último apartado usado; destino solo apartados de inversión, con "+ Nueva inversión" que abre el formulario de apartado de inversión encima y vuelve con el nuevo elegido. Rescatar: al revés. Monedas distintas: dos montos y la cotización resultante, como en Mover. Se guarda con POST /transfers. El segmento lleva plPlanGate.
6. Lista de movimientos: las transferencias INVEST y REDEEM se leen "Invertiste $ X en <apartado>" y "Rescataste $ X de <apartado>", y hay un filtro "Inversiones".
7. Hoja de ajuste: título, explicación y atajos según el tipo, con los textos exactos de CTA-06 en el archivo de textos de cuentas. Los atajos abren Mover, Invertir o Rescatar con el apartado ya elegido. En apartados de inversión, el detalle solo ofrece "Actualizar valor".
8. Inicio: la barra pasa a Gastado · Comprometido · Ahorrado/Invertido · Libre, con el token savings para el segmento nuevo y su leyenda.
9. Invalidá con RefreshBus todo lo que cambia al invertir: cuentas, apartados, inversiones, ahorros, movimientos y dashboard.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-24-invertir. Todo en verde antes del PR, con capturas de la carga en modo Invertir, la hoja de ajuste en los tres tipos y la barra del inicio.
```

## Fase 25 — Gastos programados y compromisos

Lo que ya sé que voy a pagar entra en los números del mes aunque todavía no haya pasado. Y Compromisos y el inicio usan una sola regla, así nunca muestran cifras distintas.

**Terminado cuando:** el 1/11 cargo un gasto de $ 45.000 "Turno médico" para el 20/11; no cambia el saldo de ningún apartado; aparece en Compromisos de noviembre y en los próximos 30 días; "Libre este mes" ya lo descuenta; el 20/11 aparece en "Para confirmar" y al confirmarlo pasa a gastado sin contar dos veces; un fijo de USD 9,99 en mi Visa aparece en Compromisos de los próximos meses; un resumen de $ 300.000 con $ 100.000 pagados compromete $ 200.000 en las dos pantallas; un resumen pagado no aparece.

```
Leé CLAUDE.md; MOV-08, COM-01 y COM-02 y las reglas "Movimientos programados", "Compromisos de un mes" y "Libre este mes" de docs/especificacion.md; y en docs/arquitectura.md la sección "Iteración 5: invertir, programados y compromisos".

Vamos a hacer la Fase 25 de docs/plan.md. Antes de tocar código, reproducí con un test e2e lo que hoy pasa: un fijo en tarjeta que no aparece en GET /commitments, y un resumen pagado en parte que cuenta distinto en /commitments y en /dashboard. Mostrame el resultado.

Programados:
1. Migración: SCHEDULED en TxOrigin.
2. POST /transactions con fecha posterior a hoy (ClockService) guarda PENDING con origin SCHEDULED; la cotización es una estimación y se congela al confirmar. PATCH y DELETE funcionan antes de su fecha. Tests e2e, incluido que no toca el saldo.
3. "Para confirmar" lista los pendientes con date <= hoy de cualquier origen; los programados futuros no aparecen ahí. Confirmar acepta monto y fecha.
4. Transferencias y ajustes rechazan fechas futuras con DATE_IN_FUTURE (hoy solo lo limita la web).

Una sola regla de compromisos:
5. commitmentsByMonth recibe la parte pendiente de cada resumen no pagado (statementTotals) en lugar de cuotas sueltas, los fijos en apartado y en tarjeta, los fijos ya confirmados del período y los programados pendientes. Un fijo en tarjeta se suma solo si su consumo del período no existe todavía. Tests en libs/domain para cada caso del criterio de terminado.
6. GET /commitments y GET /dashboard usan esa función con la misma entrada (armala en un solo lugar del backend). Test e2e que compara el comprometido del mes en las dos respuestas.
7. Si al revisar el dashboard ves que algo cuenta dos veces (por ejemplo, un consumo del mes que ya está en un resumen que vence este mes), no lo arregles por tu cuenta: describímelo con un ejemplo y lo definimos.

Web:
8. Carga rápida y edición de ingresos y gastos: pl-date-field sin máximo; si la fecha es futura, debajo dice "Programado: no toca tu saldo hasta que lo confirmes" y el botón dice "Programar".
9. Movimientos: los programados se ven con estilo pendiente y la etiqueta "Programado · 20/11". Compromisos y próximos 30 días los muestran con su ícono de categoría.

Forma de trabajo:
- Plan primero, esperame. Si conviene, dividila en 25a (compromisos) y 25b (programados).
- Rama feat/fase-25-programados-compromisos. Todo en verde antes del PR, con capturas de la carga con fecha futura, de Compromisos y del inicio.
```

## Fase 26 — Edición y gráficos

Dos arreglos de uso: corregir la cuenta de un movimiento sin borrarlo y ver el número exacto detrás de cada gráfico.

**Terminado cuando:** edito un gasto de $ 12.000 en el Disponible de Galicia y lo paso a Mercado Pago; los dos saldos se actualizan; un apartado en dólares no aparece como opción; en cada gráfico de la app veo el monto exacto y su etiqueta con el mouse, con Tab y tocando, y con "ocultar montos" el tooltip también los oculta.

```
Leé CLAUDE.md, MOV-04 y DAS-06 de docs/especificacion.md y la tabla "Componentes y patrones de la iteración 5" de docs/arquitectura.md.

Vamos a hacer la Fase 26 de docs/plan.md.

Cambiar el apartado:
1. PATCH /transactions/:id con pocketId: el apartado nuevo debe ser del usuario (404) y de la misma moneda (CURRENCY_MISMATCH); los de origen ADJUSTMENT y VALUATION no cambian de apartado. Tests e2e, incluido el aislamiento entre usuarios.
2. movement-sheet: campo "Cuenta" con los apartados de la misma moneda agrupados por cuenta. Si el movimiento es de otra moneda que la que el usuario quiere, un texto explica que hay que borrarlo y cargarlo de nuevo. Al guardar, invalidá los dos apartados, sus cuentas, movimientos y dashboard.

Tooltips:
3. pl-chart-tooltip en libs/web-ui: posición junto al puntero o al elemento enfocado, sin salirse de la pantalla; monto con pl-money y etiqueta; se cierra con Escape, al salir o al tocar fuera.
4. Hacé la lista de todos los gráficos de la app (inicio, tarjetas, detalle de cuenta y de apartado, inversiones, actualizar valores, compromisos, ahorros, metas, administración) y mostrámela. En cada uno, cada barra, segmento o punto es enfocable, tiene aria-label con etiqueta y monto y muestra el tooltip.
5. Test de componente del tooltip (mouse, teclado, ocultar montos).

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-26-edicion-graficos. Todo en verde antes del PR, con capturas de la edición con el selector de cuenta y de un tooltip en celular y en escritorio.
```

## Fase 27 — Empezar de cero

Poder arrancar de nuevo sin tocar la base a mano y sin perder la cuenta, el plan ni las preferencias.

**Terminado cuando:** en el perfil, "Zona peligrosa" > "Empezar de cero" muestra cuántas cuentas, movimientos, tarjetas, fijos y metas tengo; con el email mal escrito o la contraseña incorrecta no se borra nada; con la casilla "Mantener mis categorías" marcada, quedan mis categorías (con sus íconos y subcategorías), la cuenta "Efectivo" con su Disponible en $ 0 y nada más; desmarcada, quedan las categorías sugeridas; sigo con la sesión abierta, mi plan, mis monedas y mis accesos del inicio; puedo volver a ingresar con Google; los datos de otro usuario no cambian; en la auditoría aparece "user.reset".

```
Leé CLAUDE.md, AUTH-09 y la regla "Empezar de cero" de docs/especificacion.md, y la sección "Empezar de cero (AUTH-09)" de docs/arquitectura.md.

Vamos a hacer la Fase 27 de docs/plan.md.

Backend:
1. Separá deleteUserData en deleteFinancialData(tx, userId, { keepCategories }) y el borrado del usuario, en un lugar que puedan usar admin y users. El borrado del administrador (ADM-04) tiene que seguir funcionando igual: sus tests e2e no cambian.
2. Separá en UserOnboardingService la creación de los datos iniciales (cuenta "Efectivo", Disponible en pesos, categorías sugeridas y de sistema) de la asignación del plan.
3. GET /users/me/data-summary con los conteos y POST /users/me/reset con { confirmEmail, password?, keepCategories }, con sus esquemas en libs/contracts. Todo en una transacción: borrar, crear los datos iniciales y registrar user.reset en la auditoría con los conteos. Límite de intentos más estricto para este endpoint.
4. Tests e2e: borra todo lo del usuario (incluidos pendientes, programados, resúmenes y valuaciones); con keepCategories conserva categorías y subcategorías; sin él quedan las sugeridas; email o contraseña incorrectos no borran nada; cuenta solo con Google confirma con email; no toca datos de otro usuario; la sesión, el plan, las preferencias y los proveedores siguen.

Web:
5. Perfil: sección "Zona peligrosa" al final, con borde y texto en expense, y el botón "Empezar de cero".
6. Hoja de confirmación: los conteos, la lista de lo que se conserva, la casilla "Mantener mis categorías" marcada, el campo de email y, si la cuenta tiene contraseña, el de contraseña. El botón "Borrar todo" se habilita solo con el email correcto y dice cuántos movimientos se van a borrar.
7. Al terminar: limpiar lo que la app guarda en el navegador sobre datos del usuario (último apartado usado, categorías recientes, filtros), invalidar todas las claves de RefreshBus, ir al inicio y mostrar "Listo, empezaste de cero".
8. Textos en el archivo de textos del perfil.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-27-empezar-de-cero. Todo en verde antes del PR, con capturas de la zona peligrosa, de la hoja de confirmación y del inicio vacío después.
```

## Fase 28 — Cuota en el resumen que falta pagar

Al migrar compras en cuotas entre el cierre y el vencimiento de una tarjeta, la cuota que se está por pagar quedaba en el resumen abierto, y el resumen que vence en unos días no existía en platin. Compromisos mostraba de menos para ese mes.

**Terminado cuando:** con una Visa que cierra el 26 y vence el 5, el 2/11 cargo "voy por la 3 de 9" de $ 30.555,44 y elijo "En el que cerró y todavía no pagaste (vence 5/11)": la cuota 3 queda en el resumen que vence el 5/11, la 4 en el que vence el 5/12 y la 9 en el que vence el 5/5; Compromisos de noviembre suma esa cuota; la app me sugiere cerrar ese resumen, lo cierro con el total del banco y lo pago; edito una compra ya cargada como "4 de 9" en el abierto, la paso a "3 de 9" en el anterior y las cuotas se reacomodan; el 6/11 la pregunta ya no aparece; una compra nueva en un pago sigue cayendo según su fecha.

```
Leé CLAUDE.md, TAR-03 y las reglas "Ciclo de la tarjeta" y "Cuotas" de docs/especificacion.md (incluido el ejemplo), y la sección "Cuota en el resumen que falta pagar (TAR-03)" de docs/arquitectura.md.

Vamos a hacer la Fase 28 de docs/plan.md.

Dominio:
1. previousStatementWindow(card, today, overrides) en libs/domain, con el ejemplo de la especificación como test literal, más un mes corto, fechas corregidas y los bordes (el día del cierre y el día del vencimiento).

Backend:
2. startStatement en los esquemas de crear y editar consumo, válido solo con startInstallment > 1.
3. charges.service: ancla según startStatement; PREVIOUS_STATEMENT_NOT_AVAILABLE si no hay ventana o ese resumen está cerrado o pagado en platin. Si el resumen anterior no existe, se crea con statements.ensure. Al editar sin startStatement, el ancla es el resumen de la primera cuota actual: revisá que hoy una edición posterior no corra el plan y, si lo hace, arreglalo con un test.
4. GET /cards/:id con previousStatement.
5. Tests e2e: el escenario del criterio de terminado (con ClockService fijo en 2026-11-02), la edición de 4 de 9 a 3 de 9, el error fuera de la ventana y con el resumen anterior cerrado, y el aislamiento entre usuarios. Comprobá que GET /commitments incluye la cuota en noviembre.

Web:
6. Formulario de consumo (crear y editar): con "Ya empezada" y previousStatement presente, la pregunta "¿En qué resumen está la cuota k?" con las dos opciones y sus fechas, en un segmentado; por defecto el abierto. Textos en el archivo de textos de tarjetas.
7. Al guardar con la segunda opción, un aviso con acción: "Cerrá el resumen que vence el 5/11 con el total del banco para poder pagarlo", que abre el cierre (TAR-07).

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-28-resumen-anterior. Todo en verde antes del PR, con capturas del formulario con la pregunta y de Compromisos de noviembre.
```

## Iteración 6: cuentas como en el banco

Dos fases que salieron de usar platin con Mercado Pago y sus reservas. La 29 cambia el modelo de cuentas y la regla de "Libre este mes"; la 30 son arreglos de pantalla y no depende de la 29.

**Antes de empezar (vos):** la 29 cambia el esquema. Vas a recrear la base de producción después de mergearla; la migración igual tiene que funcionar con datos.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 29 | Cuentas con saldo y reservas, y libre desde los saldos | CTA-02 a 06, MOV-01, 02, DAS-05, COM-02 | Cargo gastos solo en cuentas, ingreso y retiro plata de una reserva desde la reserva, y el libre del inicio da el ejemplo de la especificación |
| 30 | Carga sin scroll, "Guardar" en programados y Compromisos con cuenta de pago | MOV-04, 09, COM-04 | Cargo un gasto con cuotas en el celular sin scrollear, edito un programado con "Guardar" y veo desde qué cuenta se paga cada compromiso |

## Fase 29 — Cuentas y reservas

Como en Mercado Pago: cada cuenta tiene su saldo y sus reservas. Los ingresos y gastos van al saldo; a una reserva la plata entra y sale por transferencias. Y "Libre este mes" pasa a salir de lo que hay en tus cuentas, sin contar nada dos veces.

**Terminado cuando:**
- la interfaz no dice "apartado" en ningún lado;
- Mercado Pago muestra su saldo y debajo sus reservas Gastos Previstos (para gastar), Vacaciones y Auto (ahorro) e Inversiones (FCI);
- al cargar un gasto solo puedo elegir cuentas;
- en Auto, "Ajustar saldo" ofrece "Ingresar desde una cuenta" y "Ajustar saldo", y "Retirar" devuelve plata al saldo de Mercado Pago;
- en Inversiones, la segunda opción es "Actualizar valor";
- no hay botones Apartar, Invertir ni Rescatar dentro de una reserva, y el modo "Invertir" de la carga rápida sigue;
- los tres valores del ejemplo de "Libre este mes" ($ 796.731,73, $ 706.731,73 y $ 506.731,73) son tests literales y el inicio muestra el primero con su desglose;
- Compromisos dice "margen" y no "libre".

```
Leé CLAUDE.md; en docs/especificacion.md el recuadro "Nombres desde la iteración 6", CTA-02 a 06, MOV-01, 02 y 07, DAS-05, COM-02 y las reglas "Cuentas y reservas", "Compromisos de un mes" y "Libre este mes" (con su ejemplo); y en docs/arquitectura.md "Iteración 6: cuentas y reservas" y "Componentes y patrones de la iteración 6".

Vamos a hacer la Fase 29 de docs/plan.md. Antes de tocar código, buscá todos los lugares que eligen o muestran un apartado (formularios, selectores, textos, contratos, servicios, tests) y mostrame la lista con lo que vas a hacer en cada uno.

Dominio:
1. PocketKind con SPENDING. freeThisMonth({ inAccounts, toCollect, toPay, cardLater }) con el ejemplo de la especificación como tests literales (los tres valores), más un caso con una compra en cuotas que vence en parte este mes y en parte después (nada se cuenta dos veces) y uno de un mes anterior. Borrá separatedThisMonth y sus tests.
2. Una función que deduzca la intención de una transferencia a partir de los tipos de sus puntas, con tests.

Backend:
3. Migración: SPENDING en el enum; convertir en SPENDING los AVAILABLE que sobran por cuenta y moneda (queda el más antiguo); índice único parcial de un AVAILABLE por (accountId, currency). Probala con datos antes de recrear la base.
4. Validaciones: ACCOUNT_BALANCE_REQUIRED en ingresos, gastos, programados, fijos, cuenta de pago de tarjeta y pagos de resumen; TRANSFER_NEEDS_ACCOUNT en transferencias, con la intención calculada en el servicio; ACCOUNT_BALANCE_EXISTS al agregar un saldo en una moneda que ya tiene; cambios de tipo solo entre SPENDING, SAVINGS e INVESTMENT. Tests e2e de cada una, con aislamiento entre usuarios.
5. GET /dashboard con inAccounts, toCollect, toPay, cardLater, free, spent y saved; toPay sale de commitmentsByMonth con la misma entrada que GET /commitments. Test e2e con el ejemplo de la especificación.
6. GET /commitments: payFrom en cada ítem y margin en lugar de free.

Web:
7. Todos los textos: "apartado" pasa a "reserva" o a "saldo de la cuenta". El tipo de reserva se elige como "¿Para qué es?": Para gastar, Ahorro o Inversión, con su explicación.
8. Cuentas: cada cuenta con su saldo por moneda y, debajo, sus reservas con uso y saldo. "+ Reserva" y "+ Saldo en otra moneda".
9. pl-account-select en la carga rápida (gasto, ingreso y transferencia), en la edición de movimientos, en fijos, en la tarjeta y en el pago del resumen. pl-pocket-select queda para reservas.
10. Detalle de reserva: "Ajustar saldo" abre la hoja con "Ingresar desde una cuenta" y "Ajustar saldo" (en inversión, "Actualizar valor"); "Retirar" abre la transferencia hacia el saldo de su cuenta. Se quitan Apartar, Invertir y Rescatar del detalle. El modo "Invertir" de la carga rápida se queda, con el origen limitado a cuentas.
11. Inicio: el libre con su desglose (en tus cuentas, + por cobrar, − a pagar este mes, − tarjeta de los meses siguientes) y la barra nueva; gastado y ahorrado del mes como datos aparte.
12. Compromisos: "Margen" en lugar de "Libre".

Forma de trabajo:
- Plan primero, esperame. Conviene dividirla en 29a (dominio, migración y backend) y 29b (web); si cambia la forma de una respuesta, el front se actualiza en el mismo PR.
- Rama feat/fase-29-cuentas-reservas. Todo en verde antes del PR, con capturas de Cuentas, del detalle de una reserva con la hoja abierta, de la carga rápida y del inicio.
```

## Fase 30 — Carga sin scroll y Compromisos con cuenta de pago

Tres arreglos de pantalla: que la carga rápida entre entera en el celular con el motivo a la vista, que editar un programado diga "Guardar" y que Compromisos diga desde dónde se paga cada cosa.

**Terminado cuando:**
- en un celular de 360 × 640, la carga rápida de un gasto con tarjeta en 3 cuotas se completa sin scrollear;
- el motivo está siempre visible debajo del monto y, si lo dejo vacío, el movimiento toma el nombre de la categoría;
- al editar un gasto programado el botón dice "Guardar";
- en Compromisos, el resumen de la Visa dice "Mercado Pago" (su cuenta de pago), un fijo dice su cuenta y una tarjeta sin cuenta de pago dice "Sin cuenta asignada" con el atajo para elegirla;
- las líneas no tienen ícono.

```
Leé CLAUDE.md, MOV-04, MOV-09 y COM-04 de docs/especificacion.md y la tabla "Componentes y patrones de la iteración 6" de docs/arquitectura.md.

Vamos a hacer la Fase 30 de docs/plan.md.

Carga rápida (MOV-09):
1. Rehacé el layout de quick-entry-sheet: monto, debajo el motivo en una línea ("¿En qué?"), una fila de categorías recientes deslizable con "Más" al final (abre pl-category-select con allowCreate), cuenta y fecha como chips en una fila, cuotas como chips en una fila deslizable, teclado más bajo y el botón. Sacá el botón del lápiz.
2. Medilo: captura con Playwright a 360 × 640 y 390 × 844 para gasto, gasto con tarjeta y cuotas, ingreso, transferencia e invertir; ninguno con scroll. Respetá las áreas táctiles de 44 px.

Programados (MOV-04):
3. En movement-sheet, al editar el botón dice "Guardar" aunque la fecha sea futura; "Programar" queda solo al crear.

Compromisos (COM-04):
4. Si la fase 29 ya está, usá payFrom de GET /commitments; si no, sumalo en esta fase (resumen: cuenta de pago de la tarjeta; fijo y programado: su cuenta), con test e2e.
5. Cada línea sin ícono, con la cuenta debajo de la descripción. "Sin cuenta asignada" abre la edición de la tarjeta en el campo de cuenta de pago.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-30-carga-compromisos. Todo en verde antes del PR, con las capturas del punto 2 y de Compromisos.
```

## Iteración 7: un inicio práctico

Una fase: el inicio rediseñado a partir del uso con datos reales, en celular y en escritorio, y la carga rápida con el selector de categorías de siempre. Las capturas de referencia están en `docs/mockups/inicio-v2/`.

| Fase | Qué se construye | Casos de uso | Terminado cuando |
| --- | --- | --- | --- |
| 31 | Inicio nuevo y selector de categorías en la carga | DAS-04, 05, 07, MOV-09 | El inicio se ve como el mockup en celular y en escritorio, y cargo un gasto eligiendo la categoría con el selector de siempre |

## Fase 31 — Inicio práctico

El inicio responde de un vistazo cuánto me queda y cuánto puedo gastar por día, muestra lo último que cargué y qué tiene que pagar cada cuenta. En escritorio aprovecha el ancho en columnas.

**Terminado cuando:**
- el inicio en celular tiene las siete secciones de DAS-07 en ese orden y se parece a `docs/mockups/inicio-v2/Celular.dc.html`;
- con el libre de $ 106.061,83 el 5/11, la tarjeta dice "≈ $ 4.079 por día hasta el 30/11"; con libre negativo dice "No te queda libre este mes" y cuánto falta;
- "Para pagar este mes" abre la lista de lo que hay que pagar con su cuenta;
- Mercado Pago muestra lo que paga este mes y "todo alcanza", y una cuenta que no llega dice cuánto le falta;
- en escritorio (1440 px) se ve como `docs/mockups/inicio-v2/Escritorio.dc.html`, y a 1024 px las columnas se apilan sin scroll horizontal;
- en la carga rápida elijo la categoría con el selector de los demás formularios, creo una nueva desde ahí y la carga sigue entrando sin scroll en 360 × 640.

```
Leé CLAUDE.md; DAS-04, DAS-05, DAS-07 y MOV-09 y la regla "Libre este mes" (incluidos "Por día" y "Lo que tiene cada cuenta para gastar") de docs/especificacion.md; en docs/arquitectura.md "Iteración 7: inicio práctico" y "Componentes y patrones de la iteración 7"; y los mockups de docs/mockups/inicio-v2/ (leé su README).

Vamos a hacer la Fase 31 de docs/plan.md.

Dominio:
1. freePerDay y accountCoverage en libs/domain, con los ejemplos de la regla como tests literales, más libre 0, libre negativo, último día del mes y un mes anterior.

Backend:
2. GET /dashboard suma perDay, daysLeft, received, accounts, unassigned y toPayItems (contrato en libs/contracts). accounts y unassigned salen de los mismos ítems de commitmentsByMonth que toPay, así la suma de toPay por cuenta más unassigned es igual a toPay. Test e2e de esa igualdad, del escenario del criterio de terminado y del aislamiento entre usuarios.

Web:
3. Reescribí el inicio con los componentes de la tabla de la iteración 7, en el orden de DAS-07. Usá los tokens de Tailwind y pl-money para todo monto; los mockups son referencia de valores, no se copia su markup.
4. Escritorio: grilla de 3 columnas desde lg, como el mockup; por debajo se apila. Sin scroll horizontal a ningún ancho.
5. "Para pagar este mes" abre una hoja con toPayItems (fecha, descripción, cuenta de pago, monto); cada ítem lleva a su resumen, fijo o programado.
6. Los accesos (DAS-04) pasan a una grilla de 4, en celular y en la columna de escritorio, con el estilo de docs/mockups/inicio-v2/Accesos.dc.html: sin tarjetas ni colores, ícono en tinta dentro de un círculo de borde fino y el nombre debajo. Siguen siendo personalizables. Revisá el resto del inicio con la regla "El color siempre significa algo" de la especificación.
7. Carga rápida: reemplazá la fila de chips y el chip "Más" por pl-category-select con su apariencia normal, allowCreate y recientes primero. Volvé a medir con Playwright a 360 × 640 y 390 × 844 (gasto, gasto con tarjeta y cuotas, ingreso) que no haya scroll.
8. Textos en el archivo de textos del inicio y de la carga rápida.

Forma de trabajo:
- Plan primero, esperame.
- Rama feat/fase-31-inicio. Todo en verde antes del PR, con capturas del inicio en celular y escritorio (claro y oscuro) y de la carga rápida.
```

## Después del MVP

La segunda tanda de la especificación, en fases chicas que se pueden hacer en cualquier orden. Los prompts siguen el mismo molde que las fases anteriores: leer `CLAUDE.md` y la sección de la especificación, plan primero, rama propia, PR con todo en verde.

| Fase | Qué incluye | Casos de uso |
| --- | --- | --- |
| 12 | Presupuestos por categoría con alertas | PRE-01 a 03 |
| 13 | Reportes y evolución del patrimonio | DAS-02, 03 |
| 14 | Tarjetas avanzado: corregir fechas y límite disponible (los fijos en tarjeta pasaron a la fase 22) | TAR-06, 10 |
| 15 | Recuperar contraseña, exportar CSV, simulador y cierre de metas, liberación de cuotas | AUTH-03, MOV-06, MET-04, 05, COM-03 |
| 16 | Mudanza a VPS (opcional): Caddy, compose de producción, backups, deploy por SSH | Sección "Docker y VPS" de la arquitectura |
