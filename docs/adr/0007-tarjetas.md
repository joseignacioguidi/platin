# 0007 — Tarjetas, resúmenes y cuotas

Fecha: 2026-10-24 · Estado: propuesta (a confirmar por Jose)

## Contexto

La fase 4 implementa TAR-01 a 05, 07 y 08. Algunos detalles no estaban escritos en la especificación.

## Decisiones

1. **Resúmenes perezosos.** Un resumen se crea cuando una cuota cae en él o cuando se consulta un rango (`GET /cards/:id/statements` asegura del resumen abierto a 11 meses adelante). Sus fechas salen de `buildStatementDates`; cambiar el día de cierre de la tarjeta solo afecta a los resúmenes que se creen después.
2. **"Resumen abierto".** Es el que corresponde a una fecha según el ciclo, salteando los ya cerrados. Una compra con fecha dentro de un resumen cerrado va al siguiente abierto (ADR 0004, punto 4). Un plan migrado ("voy por la k de N") arranca en el resumen abierto de hoy.
3. **Editar un consumo.** La descripción y la categoría siempre se pueden cambiar. Monto, fecha y cuotas regeneran el plan entero, y solo se permite si ninguna cuota está en un resumen cerrado; si no, `CARD_STATEMENT_CLOSED` (409). Borrar sigue la misma regla.
4. **Cierre.** Se puede cerrar en cualquier momento (el banco a veces adelanta el cierre). Por cada moneda con total del banco, la diferencia con el total calculado se guarda como `StatementAdjustment`, con una categoría de gasto obligatoria si hay diferencia. Un resumen sin nada que pagar queda `PAID` al cerrarse.
5. **Pago.** Solo se pagan resúmenes cerrados (`STATEMENT_NOT_CLOSED`). Se paga la parte en pesos o en dólares por separado; pagar dólares con pesos requiere `amountOut` (lo que sale de la cuenta). El estado pasa a `PARTIALLY_PAID` o `PAID` según lo pendiente.
6. **Disponible.** `available = límite − pesos pendientes de todos los resúmenes no pagados` (abiertos, cerrados y futuros). Es una versión simple de TAR-10 que pedía el mockup; los dólares no restan del límite.
7. **Gastos del mes.** En `GET /movements/summary`, los consumos con tarjeta suman en la fecha de compra por su total, igual que en la lista. Los consumos en una moneda distinta de la base no suman hasta la fase 6, porque `CardCharge` no congela cotización en el esquema.

## Consecuencias

- Los listados de tarjetas escriben (crean resúmenes) al leer; es idempotente gracias a `@@unique([cardId, period])`.
- Pendiente para la fase 6: valuar en moneda base los consumos en dólares del resumen del mes.
