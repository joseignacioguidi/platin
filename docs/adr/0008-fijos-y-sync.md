# 0008 — Fijos, sincronización y compromisos

Fecha: 2026-10-24 · Estado: propuesta (a confirmar por Jose)

## Contexto

La fase 5 implementa FIJ-01 a 04 y COM-01 y 02. Hay detalles que la especificación no fija y una dependencia con las cotizaciones de la fase 6.

## Decisiones

1. **Qué genera el sync.** `POST /sync` genera un pendiente por cada período que corresponde desde el último generado hasta el **mes actual inclusive**, aunque el día del fijo todavía no haya llegado: aparece como "Para confirmar" con su fecha esperada. Es idempotente por `@@unique([fixedId, fixedPeriod])` y `createMany(skipDuplicates)`.
2. **Pausa.** Pausar guarda el primer día del mes actual (hora de Buenos Aires) y desde ese mes no se genera nada. Al reanudar no se recuperan los meses pausados: la generación sigue desde el mes actual.
3. **Aumento.** `POST /fixed/:id/amounts` agrega un monto desde un período. Los pendientes ya generados de ese período en adelante toman el monto nuevo; los confirmados y los anteriores no se tocan.
4. **Borrar un fijo.** Solo si nunca generó movimientos confirmados (`FIXED_HAS_HISTORY`); si no, se finaliza con `endPeriod`.
5. **Pendientes en otra moneda.** Hasta la fase 6 no hay cotización del día. Un pendiente en una moneda distinta de la base se guarda con `rateToBase = 0` y `baseAmount = 0` (no cuenta en ningún total porque no está confirmado). Al confirmarlo se congela con la cotización enviada (`exchangeRate`) o, desde la fase 6, con la del día.
6. **Compromisos.** Mes M = cuotas de resúmenes **no pagados** que vencen en M + fijos de gasto con su monto vigente; los ingresos esperados salen de los fijos de ingreso. Sin cotización conocida, los dólares se informan por moneda pero no se valúan en la moneda base (`rate: null`); la fase 6 enchufa el módulo de cotizaciones.
7. **Fijos en tarjeta (TAR-09).** El esquema lo permite (`cardId`), pero por ahora la API solo crea fijos sobre cuentas; queda para la segunda tanda.
