# 0033 — Detalles del mes de punta a punta

Fecha: 2026-11-07 · Fase 37

## Contexto

Al implementar la fase 37 (regla "Cómo se llega al libre", DAS-05 y DAS-07 de la iteración 11) aparecieron puntos que ni la especificación ni la arquitectura fijaban.

## Decisión

- **El libre no cambia**: "en tus cuentas" se sigue valuando bolsillo por bolsillo con la cotización de hoy y el libre sale de ahí (`freeThisMonth`). `monthFlow` valúa cada parte (al empezar, cobrados, ya pagaste, reservaste) por moneda con la misma cotización; los centavos que deja redondear cada parte contra "en tus cuentas" van a **Otros**. Así la identidad cierra siempre al centavo. En la práctica solo aparecen con monedas que no son la base.
- **Cada moneda tiene que cerrar sola**: `monthFlow` recibe, por moneda, el saldo al empezar, los movimientos del mes agrupados y el saldo al final, y verifica `al empezar + ingresos − gastos − pagos de tarjeta − a reservas + desde reservas + ajustes + cambios = al final`. Si no cierra, lanza `MonthFlowMismatchError`: es un error de programación (algún movimiento quedó afuera), no un dato del usuario.
- **Hasta cuándo cuenta el mes actual**: el mes actual (y uno futuro) junta los movimientos desde el día 1 sin tope, igual que el saldo de hoy, que no corta por fecha. Un movimiento confirmado con fecha del mes que viene cuenta en este. Un mes anterior va del 1 al último día.
- **Qué es cada parte en la API**, sobre las cuentas y reservas para gastar no archivadas:
  - transferencia a un resumen: ya pagaste; a o desde una reserva de ahorro o inversión: reservaste;
  - entre dos de esas cuentas: se anula en la misma moneda; entre monedas queda en Otros;
  - ajustes y rendimientos (`ADJUSTMENT`, `YIELD`): Otros.
- **`received` cambia de significado**: antes eran todos los ingresos confirmados a la cotización congelada; ahora, los de las cuentas y reservas para gastar a la cotización de hoy, para que cierre la cuenta. Solo lo usaba "El mes hasta hoy".
- **`spent` sale de `GET /dashboard`**: solo lo usaban `HomeMonth` y los tests. El bot de Telegram usa `free`, `perDay` y `upcoming`. `saved` queda (la web ya no lo muestra) porque no molesta y lo prueban los tests de la iteración 6.
- **El resumen del mes trae los movimientos**, no solo sus ids: cada grupo (`monthGroupSchema`) incluye sus movimientos con el mismo formato que `GET /movements`, así la hoja los muestra y abre su edición sin otro pedido.
- **Grupos del resumen**: los ingresos por categoría (todos); lo pagado por categoría, las 6 más grandes y "Otras" (`key: "OTHER"`); sin categoría, `key: "NONE"`. Los pagos de tarjeta, por tarjeta, con el período de compras desde el día siguiente al cierre del resumen anterior hasta el cierre del último pagado (`statementPurchaseRange`). Reservaste, por reserva, neto de retiros. Los nombres de "Otras" y "Sin categoría" los pone la web.
- **Por cobrar** (`GET /dashboard/income`) usa el mismo esquema que "para pagar" (`toPayItemSchema`): `payFrom` es la cuenta donde entra. Así reusa `openToPayItem` (un fijo lleva a Fijos; un programado abre su edición).
- **La barra con signos raros**: si "al empezar" u "Otros" son negativos, van con lo que fue, en un segmento "Otros" en `muted`. Si retiraste de reservas más de lo que pusiste, eso suma a lo que tuviste. Así la barra siempre mide lo que tuviste y, con libre negativo, se pasa exactamente el libre.
- **El exceso**: `pl-stacked-bar` acepta `limit`. Cuando los segmentos suman más, dibuja una marca en `ink` donde termina y lo que sigue a rayas en `expense-ink` sobre `surface`, con su tooltip "Te pasaste". La tarjeta conserva "Te faltan $ X para cubrir lo de este mes" a la izquierda y agrega "Te pasaste $ X" debajo de la barra.
- **Mes anterior**: la tarjeta muestra la barra y las filas sin "Para pagar este mes"; "Ingresos del mes" abre solo los cobrados.
- **"Ver los N pagos de noviembre"** va una sola vez al pie de la tarjeta de cuentas y cuenta todos los pagos del mes; sale el enlace de cada cuenta.

## Consecuencias

- Un consumo con tarjeta ya no aparece en el inicio hasta que se paga su resumen (antes sumaba a "Gastaste" el día de la compra). Lo que se va a pagar este mes sigue en "Para pagar".
- La tarjeta del libre pide `GET /dashboard`; las dos hojas piden lo suyo al abrirse. Ninguna se precarga.
