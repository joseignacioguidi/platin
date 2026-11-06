# 0029 — "Libre este mes" sin las cuotas de los meses siguientes

Fecha: 2026-11-06 · DAS-05, DAS-07

## Contexto

Desde la iteración 6, el libre era `en tus cuentas + por cobrar − a pagar este mes − tarjeta de los meses siguientes`. El último término sumaba las cuotas de las compras con tarjeta del mes que vencen en resúmenes posteriores, para que comprar en cuotas no inflara el libre.

Usándolo en producción, el libre daba negativo aunque las reservas para gastar cubrían todo lo que vence en el mes. Dos problemas:

- Esas cuotas se pagan con la plata que entra en los meses en que vencen, no con la de hoy. Restarlas mezcla el mes actual con los siguientes.
- La regla no era pareja: solo restaba las cuotas futuras de las compras **del mes**. Las de una compra del mes anterior que vencen después no restaban nada, así que el libre tampoco reflejaba "todo lo que se debe a futuro".

## Decisión

- `Libre = en tus cuentas + por cobrar − a pagar este mes`. Una compra con tarjeta solo baja el libre por la parte que vence este mes, que ya está en "a pagar".
- Se borran `cardLater` y `CardInstallment` de `libs/domain`, el campo `cardLater` de `GET /dashboard` y la fila "Tarjeta, meses siguientes" (y su segmento de la barra) del inicio.
- No se muestra como dato aparte. Lo comprometido a futuro se ve en Compromisos; una pantalla propia queda para más adelante.

## Consecuencias

- El libre sube en lo que valían las cuotas futuras de las compras del mes. El ejemplo de la especificación pasa de $ 706.731,73 / $ 506.731,73 a $ 796.731,73 / $ 596.731,73.
- La respuesta de `GET /dashboard` pierde `cardLater`; web y API se despliegan juntas.
- Comprar en cuotas ya no "frena" el libre del mes: es una decisión consciente a favor de que el número responda a lo que hay que pagar este mes.
