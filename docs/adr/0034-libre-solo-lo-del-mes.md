# 0034 — La tarjeta del libre muestra solo lo del mes

Fecha: 2026-11-07 · Ajuste de la fase 37

## Contexto

Con la fase 37, la tarjeta del libre pasó a tener siete filas ("Tenías al empezar el mes", "Ingresos del mes", "Ya pagaste", "Reservaste", "Para pagar este mes", "Otros" y "Libre") y la frase "Tuviste $ X para el mes". Al usarla, eran muchos números y decían poco:

- "Libre" repetía el número grande de la izquierda.
- "Tenías al empezar el mes" mezclaba el mes anterior en lo que tiene que ser un resumen de este mes.
- "Otros" (ajustes y diferencias de cambio) casi nunca dice nada útil.
- "Reservaste" daba un total sin decir a qué reservas fue.

## Decisión

- **Filas**: "Ingresos del mes" ›, "Ya pagaste" ›, "Reservaste" y "Para pagar este mes" › (las dos últimas solo en el mes actual). Salen "Tenías al empezar", "Otros" y "Libre", y también la frase "Tuviste $ X para el mes".
- **El resumen del mes lo abre "Ya pagaste"**, porque lo que muestra es eso: lo pagado por categoría y por tarjeta (y lo reservado por reserva).
- **Reservaste por reserva**: debajo de la fila, cada reserva con su neto del mes, las 3 más grandes y "y N más". Las que dan 0 no aparecen. Una reserva de la que sacaste más de lo que pusiste aparece en negativo. `GET /dashboard` suma `reservedByPocket` (`pocketId`, `name`, `amount`), con la misma agrupación que el resumen del mes (`reservedByPocket` de `month-rows.ts`, sin los movimientos).
- **La barra** sigue con ya pagaste, reservaste, para pagar y libre. Lo que mide es al empezar + ingresos + otros + lo retirado de reservas de más (nunca menos de 0). Así, sin dibujar "Otros" ni un saldo inicial negativo, los segmentos la llenan exactamente y, con libre negativo, el exceso a rayas sigue midiendo el libre.
- **No cambia**: `monthFlow`, el libre, la identidad de la regla "Cómo se llega al libre" ni el resumen del mes, que sigue mostrando al empezar y otros.

## Consecuencias

- La tarjeta ya no cierra a simple vista: las filas no suman lo que mide la barra cuando hay saldo al empezar u otros. Para ver la cuenta completa está el resumen del mes.
- `GET /dashboard` agrupa las transferencias a reservas en cada pedido; son las mismas filas que ya cargaba para `monthFlow`, así que no hay otra consulta.
