# 0020 — Varias monedas

Fecha: 2026-10-31 · Fase 23 (MON-01 a 05)

## Contexto

La fase 23 suma euro, real, peso chileno y peso uruguayo. La especificación define la regla de conversión (todo contra el peso) y la arquitectura define los cambios de esquema, pero quedaban varios detalles abiertos.

## Decisiones

**Dominio**

- `Currency` tiene las seis monedas y `CardCurrency`, solo ARS y USD. La moneda base sigue siendo ARS o USD (`baseCurrencySchema`, más un check constraint en `User`).
- Las cotizaciones se pasan como **tabla de pesos por unidad** (`RateTable`). `convert` cruza por el peso: EUR → USD = (ARS por EUR) / (ARS por USD). Redondea a 2 decimales una sola vez, sobre el factor exacto.
- Una **cotización suelta** (la que escribe el usuario, o la que se recupera del factor congelado de un movimiento) se interpreta así: pesos por unidad de la otra moneda cuando uno de los lados es el peso (como hasta ahora con el dólar); entre dos monedas que no son el peso, unidades de destino por unidad de origen. Este segundo caso solo pasa con base USD y un movimiento en euros, reales, etc. La web muestra la unidad en la etiqueta ("Cotización (USD por EUR, opcional)").
- `impliedRate` de una transferencia sigue la misma convención: EUR → USD guarda dólares por euro (`1.080000`).
- Los totales por moneda son listas (`byCurrency`) con solo las monedas que aparecen, en el orden de la app. Si una moneda no tiene cotización conocida, queda en su línea pero **fuera del total valuado** (antes, sin cotización, el dólar se contaba como 1).

**Cotizaciones**

- El módulo `rates` pide `/v1/dolares` y `/v1/cotizaciones` en paralelo. Si falla `/v1/cotizaciones`, el dólar igual se guarda y las otras monedas siguen con su última cotización: el fallback es por moneda.
- `GET /rates/latest` devuelve una fila por moneda y tipo, con `currency`.
- Para valuar se usa el dólar del tipo preferido y el oficial de las demás monedas.

**Monedas activadas**

- `User.currencies` siempre se guarda y se devuelve normalizado: incluye el peso y la moneda base, sin repetidos y en orden (`normalizeCurrencies`). Cambiar la base a USD activa el dólar.
- `CURRENCY_IN_USE` (409, con `currencies` como extensión) cuando se quiere desactivar una moneda que usa algo activo: un apartado no archivado, un fijo que no está pausado ni terminado, o una meta activa. Lo archivado o terminado no cuenta: el historial se conserva.
- `CURRENCY_NOT_ENABLED` (422) al crear un apartado, un movimiento, una transferencia, un fijo o una meta en una moneda desactivada. También al **volver a activar** algo en esa moneda (desarchivar un apartado, reanudar un fijo, reactivar una meta), porque eso podría dejar una moneda desactivada en uso.
- `CurrenciesService` es global (en `CommonModule`) porque lo usan casi todos los módulos.

**Contratos que cambian de forma**

- Cuentas: `totals` pasa a lista y se suma `totalBase` (valuado en la moneda base, `null` si falta alguna cotización).
- Compromisos: `committed` y `expectedIncome` pasan a `{ byCurrency, base }`.
- Ahorros: `usd`, `ars` y `arsInUsd` se reemplazan por `byCurrency` con el valor en dólares de cada moneda.
- Inversiones: `totals` pasa a lista con `currency`.
- La web se actualizó en la misma rama.

**Migración**

- Sale de `prisma migrate diff`, escrita a mano: `prisma migrate dev` no corre sin interacción cuando cambia una clave única. Hace lo que pide la arquitectura: amplía el enum, agrega `User.currencies` con ARS y USD por defecto, agrega `ExchangeRate.currency` (las filas existentes quedan como USD) y la clave única `(date, currency, type)`. Suma los check constraints de moneda de tarjeta, más uno para la moneda base.

**Web**

- `pl-currency-select` (en `web-ui`) lee las monedas activadas del token `PL_ENABLED_CURRENCIES`, que la app provee desde el usuario. Hasta tres monedas se muestra como segmentado; con más, como lista. Con `cardOnly` ofrece solo ARS y USD. Siempre ofrece la moneda actual, aunque se haya desactivado después.
- El perfil tiene una sección "Monedas". Calcula en el navegador por qué una no se puede desactivar (apartado, fijo o meta activa) y la API lo vuelve a verificar.
- Las transferencias entre monedas muestran "$ 1.680 por euro", o "1 EUR = 1,08 USD" entre dos monedas que no son el peso (`formatRate`). Sus títulos pasan a "Compra de euros", "Venta de reales" o "Cambio de moneda".

## Consecuencias

- Migración nueva: `20261031120000_multi_currency`.
- Pendiente: la carga rápida sigue permitiendo cambiar la moneda de una tarjeta solo entre ARS y USD (correcto, por MON-05). Un movimiento en otra moneda sobre un apartado usa la moneda del apartado, como siempre.
