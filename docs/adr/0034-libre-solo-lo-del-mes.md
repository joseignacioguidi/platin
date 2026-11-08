# 0034 — La tarjeta del libre muestra solo lo del mes

Fecha: 2026-11-07 · Ajuste de la fase 37

## Contexto

Con la fase 37, la tarjeta del libre pasó a tener siete filas ("Tenías al empezar el mes", "Ingresos del mes", "Ya pagaste", "Reservaste", "Para pagar este mes", "Otros" y "Libre") y la frase "Tuviste $ X para el mes". Al usarla, eran muchos números y decían poco:

- "Libre" repetía el número grande de la izquierda.
- "Tenías al empezar el mes" mezclaba el mes anterior en lo que tiene que ser un resumen de este mes.
- "Otros" (ajustes y diferencias de cambio) casi nunca dice nada útil.
- "Reservaste" daba un total sin decir a qué reservas fue.
- El resumen del mes repetía todo eso: lo que tuviste, los aportes a reservas mezclados con los gastos, para pagar, otros y libre.

## Decisión

- **Filas**: "Ingresos del mes" ›, "Ya pagaste" ›, "Reservaste" › y "Para pagar este mes" › (la última solo en el mes actual). Salen "Tenías al empezar", "Otros" y "Libre", y también la frase "Tuviste $ X para el mes".
- **El resumen del mes se parte en dos hojas** (la misma, `MonthSummarySheet`, con `view`):
  - "Ya pagaste" abre "A dónde fue": lo pagado por categoría y por tarjeta, nada más.
  - "Reservaste" abre cada reserva con su neto del mes.
  - En las dos, cada grupo se abre y muestra sus movimientos, y un movimiento abre su edición. Salen "Lo que tuviste", "Para pagar este mes", "Otros" y "Libre". `GET /dashboard/summary` no cambia: la web usa solo los grupos que necesita.
- **Reservaste por reserva en la tarjeta**: debajo de la fila, cada reserva con su neto del mes, las 3 más grandes y "y N más". Las que dan 0 no aparecen. Una reserva de la que sacaste más de lo que pusiste aparece en negativo. `GET /dashboard` suma `reservedByPocket` (`pocketId`, `name`, `amount`), con la misma agrupación que el resumen (`reservedByPocket` de `month-rows.ts`, sin los movimientos). Si una API vieja no lo manda, la tarjeta muestra las filas sin el detalle (la web y la API se publican por separado).
- **La barra** sigue con ya pagaste, reservaste, para pagar y libre. Lo que mide es al empezar + ingresos + otros + lo retirado de reservas de más (nunca menos de 0). Así, sin dibujar "Otros" ni un saldo inicial negativo, los segmentos la llenan exactamente y, con libre negativo, el exceso a rayas sigue midiendo el libre.
- **No cambia**: `monthFlow`, el libre y la identidad de la regla "Cómo se llega al libre".

## Consecuencias

- La tarjeta ya no cierra a simple vista: cuando hay saldo al empezar u otros, las filas no suman lo que mide la barra. La identidad se sigue verificando en `monthFlow`, pero ya no hay una pantalla que la muestre entera.
- `GET /dashboard/summary` sigue mandando `opening`, `other`, `toPay`, `free` e `income`, que la web ya no muestra. Se dejan porque no molestan y los prueban los e2e de la fase 37.
- `GET /dashboard` agrupa las transferencias a reservas en cada pedido; son las mismas filas que ya cargaba para `monthFlow`, así que no hay otra consulta.
