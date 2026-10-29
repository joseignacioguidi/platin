# 0014 — Administrador: rol, panel, configuración y auditoría

Fecha: 2026-10-28 · Fase 18

## Contexto

La fase 18 suma un usuario administrador (ADM-01 a 05 y ADM-07). Algunos puntos no estaban definidos en la especificación ni en la arquitectura; se resolvieron como se detalla abajo.

## Decisiones

- **El rol lo define `ADMIN_EMAILS` en las dos direcciones.** En cada login, registro y refresh, el rol se iguala a la lista: quien está pasa a `ADMIN` y quien sale vuelve a `USER`. Así la configuración del servidor es la única fuente del rol. Los emails se comparan en minúsculas.
- **El JWT lleva el claim `role`** y `GET /users/me` también devuelve `role`. El front lo usa solo para mostrar u ocultar el panel. `AdminGuard` vuelve a consultar el rol y el estado en la base en cada pedido.
- **"No quitarse el rol a sí mismo":** no hay ningún endpoint para cambiar roles, así que la regla se aplica a suspenderse y a eliminarse (`ADMIN_SELF_ACTION`, 409). Cerrar las propias sesiones sí está permitido.
- **Suspensión:**
  - Revoca todos los refresh tokens. El login y el refresh responden `ACCOUNT_SUSPENDED` (403).
  - El token de acceso que ya estaba emitido sigue sirviendo hasta que vence (15 minutos como máximo). No se consulta el estado en cada pedido para no sumar una consulta a toda la API.
- **Registro cerrado:** `POST /auth/register` responde `REGISTRATION_CLOSED` (403), salvo para los emails de `ADMIN_EMAILS`, para que el administrador siempre pueda crear su cuenta.
- **Configuración (`AppSetting`):** hay cuatro claves, cada una con su esquema Zod en `libs/contracts`.
  - `registration`: `{ open }`.
  - `announcement`: `{ text, startsOn, endsOn }`. Se muestra si tiene texto y hoy está entre las fechas, ambas inclusive.
  - `suggested-categories`: la lista con la que arranca cada usuario nuevo. Ajustes y Rendimientos se agregan siempre.
  - `default-rate`: el tipo de cotización con el que arranca cada usuario nuevo.
  - Ninguna de estas claves cambia a los usuarios que ya existen. Sin fila guardada, se usa el valor por defecto de antes.
  - El plan por defecto no es una clave: vive en `Plan.isDefault` (fase 19).
- **Actividad:** se registra con un *interceptor* global en lugar de un *middleware*. El middleware corre antes del guard de autenticación y todavía no conoce al usuario. Un mapa en memoria evita escribir más de una vez por usuario y día. Esa única escritura diaria se espera antes de seguir con el pedido (así no queda nada corriendo después de la respuesta), pero si falla no lo rompe.
- **"Uso por funcionalidad":** un usuario cuenta si tiene al menos una tarjeta sin archivar, una meta activa, un fijo sin pausar, un apartado de inversión o un apartado de ahorro sin archivar.
- **Altas por semana:** semanas de lunes a domingo en hora de Buenos Aires (`countByWeek` en `libs/domain`).
- **Borrar un usuario:** las relaciones financieras son `Restrict`, así que `deleteUserData` borra todo en orden, de hijos a padres, dentro de la transacción del borrado. No se cambiaron las claves foráneas.
- **Auditoría:** `AuditLog` no tiene claves foráneas, así que sobrevive al borrado del usuario. La entrada `user.delete` guarda el email para seguir mostrándolo.
- **Módulos:** `admin` importa solo `settings` y `audit`. Cuenta registros con Prisma y nunca importa módulos financieros. La lista por defecto de categorías sugeridas se lee del archivo de datos `categories/suggested-categories.ts`, que no es un módulo de Nest.
- **Orden de los apartados de una meta:** se fija por fecha de creación. El test de la meta del auto fallaba de forma intermitente porque Postgres no garantiza ningún orden sin `ORDER BY`.

## Consecuencias

- Hay una migración nueva (`admin`): `role`, `status` y `lastSeenAt` en `User`, y las tablas `AppSetting`, `AuditLog` y `ActivityDay`.
- Endpoints nuevos: `/admin/metrics`, `/admin/users` (con `:id`, `suspend`, `reactivate`, `logout` y `DELETE`), `/admin/settings/:key`, `/admin/audit` y `/announcements/current`.
- Códigos de error nuevos: `ACCOUNT_SUSPENDED`, `REGISTRATION_CLOSED`, `ADMIN_SELF_ACTION` y `CONFIRMATION_MISMATCH`.
