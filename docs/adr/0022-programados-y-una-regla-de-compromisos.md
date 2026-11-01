# 0022 — Programados y una sola regla de compromisos

Fecha: 2026-11-01 · Fase 25 (MOV-08, COM-01, COM-02)

## Contexto

Antes de esta fase, un e2e reprodujo dos diferencias. `GET /commitments` no mostraba los fijos en tarjeta: para un fijo de USD 9,99 en la Visa, diciembre devolvía `byCurrency: []`. Además, un resumen de $ 300.000 con $ 100.000 pagados comprometía $ 300.000 en Compromisos, porque sumaba las cuotas sueltas, y $ 200.000 en el inicio, porque usaba la parte pendiente. La fase agrega también los gastos e ingresos programados.

## Decisiones

**Una sola regla.** `commitmentsByMonth` recibe la parte pendiente de cada resumen no pagado, los fijos en apartado y en tarjeta (con los ciclos de las tarjetas y sus fechas corregidas), los movimientos que ya generaron los fijos en apartado, los consumos que ya generaron los fijos en tarjeta y los programados pendientes. `CommitmentsInputBuilder` (módulo de compromisos) arma esa entrada en un solo lugar; `GET /commitments` y `GET /dashboard` la usan igual.

- Un fijo en tarjeta sin consumo del período se suma en el mes en que **vence** el resumen que le toca (`statementPeriodFor` + `statementDatesFor`). Por eso se miran ocurrencias desde dos meses antes del rango.
- Un fijo en apartado ya generado y pendiente compromete su propio monto (puede haberse corregido); uno confirmado no compromete.
- Los ítems de Compromisos cambian: `STATEMENT` (lo pendiente de un resumen en una moneda, con sus cuotas como detalle, así COM-03 sigue visible), `FIXED` (con `cardName` si es en tarjeta) y `SCHEDULED` (con la categoría). Desaparece `INSTALLMENT`.
- En el inicio, los ingresos esperados suman además los programados del mes. El resto de la definición de ingresos esperados y de gastado no cambia.

**Programados.**

- `POST /transactions` con fecha posterior a hoy guarda `PENDING` + `SCHEDULED`, con la cotización de **hoy** como estimación.
- Al confirmar, un programado siempre se recongela con la cotización de su fecha (o con la enviada).
- `POST /transactions/confirm` acepta `date` (nunca posterior a hoy, `DATE_IN_FUTURE`). Un pendiente que se confirma **antes de su fecha** (un fijo pagado antes, un programado adelantado) toma la fecha de hoy, así nunca queda un movimiento confirmado con fecha futura.
- `PATCH` de un movimiento confirmado no puede llevarlo a una fecha futura (`DATE_IN_FUTURE`). Uno pendiente sí puede.
- "Para confirmar" muestra solo los pendientes con `date <= hoy`. `GET /movements` acepta `until` y la página de pendientes lo manda con hoy. El conteo del inicio y el de `POST /sync` usan la misma regla. Un fijo con fecha futura en el mes (el alquiler del 28) también espera a su fecha: lo dice la especificación ("sin importar su origen"). Dos tests viejos se ajustaron por esto.
- `DATE_IN_FUTURE` también en transferencias, ajustes y **pagos de resumen** (un pago es una transferencia). Los tests de tarjetas pagaban con fecha futura y se corrigieron sus fechas.

**Web.**

- La carga rápida y la edición de un pendiente aceptan fechas futuras solo para ingresos y gastos (no para tarjeta, transferencia ni inversión). Muestran "Programado: no toca tu saldo hasta que lo confirmes." y el botón dice "Programar".
- En la lista, un programado lleva el estilo de pendiente y "Programado · 20/11" al principio del subtítulo, en lugar de la etiqueta, para no comerle lugar al título.

## Para definir (punto 7 del plan, sin cambios)

**Doble conteo en el inicio cuando un resumen vence el mismo mes de la compra.** Ejemplo: la Visa cierra el 2 y vence el 12. El 1/11 compro algo de $ 50.000. La compra entra en "Gastado" de noviembre (consumos del mes) y su resumen, que vence el 12/11, entra en "Comprometido" de noviembre. "Libre" descuenta $ 100.000. Con los cierres habituales (cierra a fin de mes y vence a principios del siguiente) no pasa, porque la compra se gasta en un mes y se compromete en el siguiente.

**Fijos en tarjeta generados antes de su día.** `POST /sync` crea el consumo del período actual apenas empieza el mes: el 1/11 ya existe el consumo de Netflix fechado el 10/11, y cuenta como "Gastado" de noviembre. Pasaba desde la fase 22; no lo cambié.

## Consecuencias

- Compromisos y el inicio no pueden volver a diferir para un mes: comparten la función y la entrada, y hay un e2e que lo verifica.
- La migración solo agrega `SCHEDULED` a `TxOrigin`.
