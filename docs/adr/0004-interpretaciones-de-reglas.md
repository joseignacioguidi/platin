# 0004 — Interpretaciones de reglas de negocio

Fecha: 2026-10-23 · Estado: propuesta (a confirmar por Jose)

## Contexto

Al pasar las reglas de la especificación a `libs/domain` hubo puntos que admitían más de una lectura. Estas son las decisiones tomadas, cada una con su test.

## Decisiones

1. **Ajustes de saldo con signo.** "Montos siempre positivos; el signo lo da el tipo" vale para `INCOME` y `EXPENSE`. Un movimiento `ADJUSTMENT` (CTA-04) guarda la diferencia **con signo** (`-1500.00` si el saldo real es menor), igual que `StatementAdjustment` y `GoalContribution` en el esquema. Así el saldo cumple "± ajustes" y los ajustes no se mezclan con ingresos ni gastos en los totales.
2. **Ritmo de una meta.** El plan abarca desde el mes de creación hasta el mes objetivo, ambos incluidos. A hoy espera `objetivo × meses completos transcurridos antes del mes actual / meses totales`. Con la meta del auto creada en enero de 2026: 15.000 × 9 / 24 = USD 5.625; con USD 4.200, "atrasado USD 1.425", igual que el mockup.
3. **Vencimiento del resumen.** Es el primer día de vencimiento *estrictamente posterior* al cierre: cierre 30/10 y vencimiento 5 → 05/11; cierre 5 y vencimiento 18 → el 18 del mismo mes; si los dos días coinciden, el mes siguiente.
4. **Compra en un resumen ya cerrado.** `statementPeriodFor` devuelve el resumen que corresponde por fecha. Si ese resumen ya está cerrado, el servicio carga el consumo en el primer resumen abierto siguiente, como hace el banco con un consumo que llega tarde (se implementa en la fase 4).
5. **"4 de 12" en la lista de cuotas.** El número que se muestra es la última cuota en un resumen cerrado, coherente con el mockup (Heladera "4 de 12", restan 8 cuotas). Un plan migrado como "voy por la 4" muestra "3 de 12" hasta que cierre el primer resumen, y le restan 9 cuotas.
6. **Fijo en pausa.** No genera nada desde el mes de la pausa. Al reanudarlo no se generan los meses pausados (se resuelve en la fase 5).
7. **Libre del mes.** La regla de compromisos define "libre = ingresos esperados − comprometido" (`commitmentsByMonth`). El inicio usa "ingresos esperados − comprometido − gastado" (`freeThisMonth`), que es lo que muestra el mockup: 1.850.000 − 674.000 − 763.700 = 412.300. Para no contar dos veces un fijo ya confirmado, el comprometido del mes en curso incluye solo lo que todavía no se pagó (fase 6).
8. **Cotización a moneda base.** `rateToBase` se guarda redondeado a 6 decimales, pero `baseAmount` se calcula con el factor exacto: si la base es USD, 1 / cotización no pierde precisión.
9. **Formato de montos.** `formatMoney` arma el formato es-AR a mano (`$ 18.500,00`, `USD 771,43`) para que sea igual en Node y en todos los navegadores.
