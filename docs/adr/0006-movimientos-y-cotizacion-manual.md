# 0006 — Listado unificado de movimientos y cotización manual

Fecha: 2026-10-24 · Estado: aceptada

## Contexto

La pantalla Movimientos (mockup) muestra en una sola lista ingresos, gastos, transferencias (incluida la compra de dólares) y, desde la fase 4, consumos con tarjeta. La arquitectura solo lista `GET/POST /transactions` y `POST /transfers`, que son tablas distintas. Además, hasta la fase 6 no hay cotizaciones automáticas.

## Decisiones

1. **`GET /movements` (solo lectura).** Une `Transaction` y `Transfer` (y `CardCharge` en la fase 4), ordenados por fecha, `createdAt` e `id` descendentes, con paginación por cursor (`?cursor=&limit=`) y filtros: período, cuenta, categoría, tipo (`EXPENSE`, `INCOME`, `TRANSFER`), estado y texto. Cada fuente se consulta con el mismo cursor y las páginas se combinan. `GET /movements/summary?period=` da ingresos y gastos confirmados del mes en moneda base y la cantidad de pendientes. `/transactions` y `/transfers` quedan para crear, editar, borrar y confirmar.
2. **`exchangeRate` en el request, `rateToBase` en la respuesta.** Para el usuario, la cotización siempre es "pesos por dólar", así que el request recibe `exchangeRate` (ARS por USD) y la API calcula el factor a la moneda base con `toBase` de `libs/domain`. Es obligatorio cuando la cuenta no está en la moneda base (`EXCHANGE_RATE_REQUIRED`). En la fase 6 pasa a ser opcional y, si viene, manda sobre la cotización del día.
3. **Colores como nombres de token.** `Account.color` y `Category.color` guardan el nombre de un token de diseño (`expense`, `card`, …), nunca un hex. El contrato los valida con un enum.
4. **Restricciones en la base.** Además del "exactamente un destino" de `Transfer`, la migración agrega checks de montos positivos (salvo los ajustes, ver ADR 0004).
5. **Totales del día en la lista.** Suman ingresos y gastos confirmados en moneda base; las transferencias no suman, porque no cambian el patrimonio. El mockup restaba la compra de dólares, pero eso mezcla un cambio de moneda con un gasto.

## Consecuencias

- Una cuenta archivada no acepta movimientos nuevos (`ACCOUNT_ARCHIVED`), pero su historial se sigue viendo.
- Editar solo la descripción o la categoría conserva la cotización congelada; cambiar el monto, la cuenta o la cotización la vuelve a congelar.
