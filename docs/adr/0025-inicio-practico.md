# 0025 — Inicio práctico: cuentas y sus pagos, por día y grilla de escritorio

Fecha: 2026-11-05 · Fase 31 (DAS-04, 05, 07, MOV-09)

## Contexto

La iteración 7 rediseña el inicio (`docs/mockups/inicio-v2/`) y suma a `GET /dashboard` `perDay`, `daysLeft`, `received`, `accounts`, `unassigned` y `toPayItems`. La arquitectura fija la forma, pero deja abiertos algunos detalles, y un criterio de terminado choca con el breakpoint que propone.

## Decisiones

**Cuentas y sus pagos.**

- Una fila por cuenta y moneda (`accountId` + moneda del saldo o reserva para gastar). Lo que tiene para gastar es la suma de sus saldos y reservas para gastar en esa moneda.
- Un pago va a la fila de la cuenta y moneda de su `payFrom`. Si el ítem está en otra moneda (la parte en dólares de un resumen que se paga desde un saldo en pesos), se valúa en la moneda de esa fila con la cotización de hoy, como el resto del libre. Si no hay cotización para convertirlo, queda en una fila de la misma cuenta en la moneda del ítem.
- Se listan todas las cuentas con saldo o reserva para gastar, aunque no paguen nada ("Efectivo · Sin pagos este mes", como en el mockup). Primero las que pagan algo; después, en su orden de siempre.
- `unassigned` va en moneda base y es `null` si no hay nada sin cuenta de pago. En el inicio aparece al final de las cuentas como "Sin cuenta asignada".
- En moneda base, la suma de `toPay` por cuenta más `unassigned.toPay` da `toPay` cuando los ítems están en la moneda base (es lo que verifica el test e2e). Con ítems en otra moneda puede haber diferencias de centavos, porque cada ítem se valúa por separado.
- Cada cuenta muestra sus próximos 3 pagos también en escritorio (el mockup de escritorio muestra 4; manda DAS-07). "Ver los N pagos de noviembre" lleva a Compromisos.
- En un mes anterior no hay cuentas, `unassigned` ni `toPayItems`, y el inicio esconde "Tus cuentas y sus pagos".

**Por día y libre negativo.**

- `perDay` se redondea a pesos hacia abajo (`freePerDay`). Un período futuro cuenta todos sus días; uno pasado da `daysLeft: 0` y `perDay: null`.
- Con libre negativo, el inicio dice "No te queda libre este mes" y "Te faltan $ X para cubrir lo de este mes", donde X es el libre en valor absoluto.
- "Tus $ X en cuentas se reparten así": X es en tus cuentas + por cobrar, que es lo que reparte la barra (DAS-05).

**Lo que abre cada cosa.**

- En la hoja "Para pagar este mes", un resumen abre su tarjeta, un fijo abre Fijos y un programado abre su hoja de edición (se busca entre los pendientes de su mes).
- "Últimos movimientos" pide `GET /movements?limit=8&until=<hoy>`: un programado con fecha futura no es un movimiento "último". En celular se ven los primeros 5.

**Escritorio desde `xl`, no desde `lg`.**

- La arquitectura dice "grilla de 3 columnas desde `lg`", pero el criterio de terminado pide que a 1024 px las columnas se apilen. A 1024 px (`lg`) la barra lateral deja unos 704 px de contenido, y tres columnas no entran (el mockup también las apila ahí). La grilla arranca en `xl` (1280 px). Entre `lg` y `xl` se ve una columna, como en celular.
- Solo en el inicio, el contenedor del shell se ensancha a `max-w-6xl` desde `xl` (`has-[>pl-dashboard-page]`). El resto de las pantallas sigue en una columna de `max-w-3xl`.
- Los accesos son una grilla de 4 en celular y en la columna de escritorio, sin tarjetas ni colores (`Accesos.dc.html`). Los nombres nunca se cortan: dos palabras pasan a dos líneas ("Para confirmar"); una palabra larga ("Compromisos") puede ocupar unos píxeles del espacio entre accesos, centrada.

**Token nuevo.** `expense-ink` (#B3401C claro, #FFA58C oscuro) para "te faltan $ X". La arquitectura ya lo nombra y no existía. `expense` sobre blanco no llega a contraste AA para texto chico.

**Carga rápida.** El selector de categorías reemplaza la fila de chips y el chip "Más". Muestra "Elegí una categoría" hasta que se elige una. Sigue entrando sin scroll en 360 × 640 con tarjeta y cuotas.

## Consecuencias

- `GET /dashboard` hace una consulta más (las cuentas de pago de los ítems) y una agregación más (`received`).
- El inicio ya no muestra "Próximos 30 días". `upcoming` sigue en la respuesta para no romper clientes, aunque la web no lo usa.
- Si en algún momento se quiere la grilla a 1024 px, habría que achicar la barra lateral o pasar a dos columnas en `lg`.
