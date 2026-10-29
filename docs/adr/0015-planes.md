# 0015 — Planes con límites, sin cobro

Fecha: 2026-10-28 · Fase 19

## Contexto

La fase 19 suma planes con límites, asignados por el administrador y sin cobro (PLN-01 a 06 y ADM-06). El plan pedía proponer límites iniciales y consultarlos antes de fijarlos. Como la fase se hizo en modo autónomo, se fijaron estos valores y quedan para revisar.

## Decisiones

- **Límites iniciales (migración `plans`), a confirmar:**

  | Plan | Cuentas | Apartados | Tarjetas | Metas | Fijos | Inversiones | Por defecto |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | Gratis | 3 | 5 | 2 | 3 | 15 | no | sí |
  | Pro | ∞ | ∞ | ∞ | ∞ | ∞ | sí | no |

  - Se editan desde el panel sin migraciones.
  - El precio de referencia queda vacío hasta que el administrador lo cargue.
- **Usuarios que ya existían:** no tienen `UserPlan`, así que les corresponde el plan por defecto (Gratis). No pierden datos (PLN-05).
  - Si tenían inversiones, la pantalla se oculta hasta que el administrador les asigne Pro.
  - Esto incluye al propio administrador: después de desplegar, asignate Pro desde el panel.
- **Qué cuenta para cada límite** (lo archivado no cuenta):
  - **Cuentas:** las que no están archivadas.
  - **Apartados:** solo los que agrega el usuario (ahorro e inversión). El "Disponible" de cada cuenta viene con ella y no cuenta.
  - **Tarjetas:** las que no están archivadas.
  - **Metas:** las activas. Las cumplidas o canceladas no cuentan.
  - **Fijos:** los que no están pausados.
- **Inversiones deshabilitadas:**
  - `GET /investments` y `POST /investments/valuations` responden `FEATURE_NOT_IN_PLAN`, y también la creación de un apartado de inversión.
  - Siguen permitidos borrar una valuación y ver el historial de un apartado, como con los demás datos existentes.
- **Vencimiento:**
  - El administrador elige el **último día** del plan. `endsAt` guarda el primer instante en que ya no aplica, que es la medianoche siguiente en Buenos Aires (`startOfDayIn`).
  - `resolveCurrentPlan` compara instantes, como pide la arquitectura.
- **Plan vigente:** es la asignación con el `startsAt` más reciente entre las que no vencieron.
  - Al vencer Pro de prueba, vuelve a regir la asignación anterior (la `DEFAULT` del registro) o, si no hay ninguna, el plan por defecto.
- **Plan por defecto:**
  - Vive solo en `Plan.isDefault`, con el índice único parcial.
  - Cambiarlo afecta a los usuarios nuevos y a los que nunca tuvieron una asignación. Los que se registraron después de esta fase conservan su asignación `DEFAULT`.
  - El plan por defecto no se puede archivar (`PLAN_IS_DEFAULT`).
- **Solicitudes:**
  - Hay una pendiente por usuario como máximo (`PLAN_REQUEST_PENDING`), y no se puede pedir el plan que ya se tiene (`PLAN_ALREADY_ACTIVE`).
  - Aprobar asigna el plan sin vencimiento (`source: REQUEST`).
- **Errores de plan:**
  - Son 403 con miembros de extensión de Problem Details: `{ resource, limit, used, plan }`.
  - El front los intercepta y abre la hoja "Pedir otro plan". La hoja se carga bajo demanda para no pesar en la landing.
- **`PlansModule` es global:** todo módulo que crea un recurso limitado consulta `EntitlementsService` sin tener que importarlo.
- **Tests:** el reset de la base vacía también `Plan`, así que siembra un "Gratis" sin límites para que las demás suites no choquen con ninguno. Los tests de planes fijan sus propios límites desde el panel.
- **`/planes`:** se prerenderiza sin datos y lee `GET /plans` en el navegador, así un cambio en el panel se ve enseguida sin volver a desplegar.

## Consecuencias

- Hay una migración nueva (`plans`): `Plan`, `UserPlan` y `PlanRequest`, el índice único parcial de `isDefault` y los dos planes iniciales.
- Endpoints nuevos: `GET /plans` (público), `GET /me/plan` y `POST /plan-requests`. En el panel: `GET/POST /admin/plans`, `PATCH /admin/plans/:id`, `POST /admin/users/:id/plan`, `GET /admin/plan-requests` y `POST /admin/plan-requests/:id/approve` y `/reject`.
- Para el cobro: un `PaymentProvider` crearía `UserPlan` con `source: PAYMENT` y `endsAt` al fin del período pago. Nada de lo anterior cambia.
