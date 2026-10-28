# 0010 — Formularios propios, edición de consumos y categorías

Fecha: 2026-10-27 · Fase 9

## Contexto

La fase 9 reemplaza los `<select>` y `<input type="date">` nativos, permite editar consumos de tarjeta (TAR-11) y agrega la gestión de categorías (CAT-01 a 05). Algunos detalles no estaban definidos en la especificación.

## Decisiones

**Componentes de formulario (`libs/web-ui`)**

- `pl-select`, `pl-category-select`, `pl-date-field`, `pl-icon-picker` y `pl-color-picker` funcionan con signals (`[(value)]`) y con Reactive Forms (`ControlValueAccessor`), con una base común `PlFormControl`.
- El panel se abre con un overlay del CDK: anclado al campo desde 640 px de ancho (el `sm` de Tailwind) y como hoja inferior por debajo. Escape y tocar afuera lo cierran, y el foco vuelve al campo.
- "Hoy" para el calendario llega por el token `PL_TODAY`, que la app provee desde su servicio `Today` (zona de Buenos Aires).
- **También se reemplazaron los `<input type="month">`** (fijos, nuevo monto de un fijo, meta) por un `pl-select` de meses. La especificación solo nombra los de fecha, pero el de mes no existe en Firefox ni en Safari de escritorio.
- En lugar de una regla de ESLint, un test de `apps/web` falla si vuelve a aparecer un `<select>`, un `type="date"` o un `type="month"` en la app o en `libs/web-ui`.

**Edición de consumos (TAR-11)**

- La respuesta de un consumo incluye `locked`: alguna cuota está en un resumen no abierto.
- Un `PATCH` que manda monto, fecha o cuotas **iguales** a los actuales no cuenta como cambio del plan. Así el formulario puede mandar el consumo entero y la API solo rechaza con `CARD_STATEMENT_CLOSED` los cambios reales.
- La moneda y el "voy por la cuota k" no se editan (la API no los acepta en la edición).

**Categorías**

- Categorías de sistema: **Ajustes** (gasto, ícono `scale`, gris) y **Rendimientos** (ingreso, ícono `trending-up`, celeste), con `systemKey` `ADJUSTMENT` y `YIELD`. Se crean al registrarse y, para los usuarios existentes, en la migración (si ya tenían una con ese nombre y tipo, esa pasa a ser la de sistema).
- No se ofrecen en los formularios de carga. Los ajustes de saldo usan Ajustes; los rendimientos (fase 11) usarán Rendimientos.
- No se pueden editar, archivar, fusionar ni usar como padre (`CATEGORY_SYSTEM`).
- **Un solo nivel de subcategorías**: el padre tiene que ser una categoría de primer nivel, del mismo tipo y que no sea de sistema; una categoría con subcategorías no puede pasar a ser una (`CATEGORY_INVALID_PARENT`).
- **Fusionar** mueve movimientos, consumos, ajustes de resumen y fijos a la destino (mismo tipo, activa), y archiva la original en una transacción. Las subcategorías de la original pasan a la destino (o al padre de la destino, si la destino es una subcategoría). Presupuestos todavía no existen: se suman cuando llegue la fase 12. La respuesta dice cuántos registros se movieron.
- `GET /categories?usage=true` agrega `usageCount` (movimientos, consumos, ajustes de resumen y fijos), que la pantalla muestra y la confirmación de fusión usa.

## Consecuencias

- El esquema suma `Category.systemKey` con su índice único por usuario (migración `20261027120000_category_system_key`). En la fase 10 las migraciones se unifican en una inicial.
- Todo campo nuevo de la app tiene que usar estos componentes; el test lo hace cumplir.
