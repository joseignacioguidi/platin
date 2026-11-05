# 0025 — Carga por texto y bot de Telegram

Fecha: 2026-11-05 · Iteración 8, fases 32 y 33 (TXT-01 a 04, BOT-01 a 06)

## Contexto

Cargar un gasto tiene que ser tan simple como mandar un mensaje. Un parser con reglas interpreta una línea corta y la convierte en un borrador; el borrador se muestra y solo se guarda al confirmar, con los mismos servicios que la carga rápida. Hace falta guardar alias de cuentas y tarjetas, reglas de comercio, el vínculo con Telegram, los borradores del bot, la idempotencia del webhook y lo que el parser no entiende.

## Decisiones

- **`channel` y no un origen nuevo.** `TxOrigin` dice por qué existe un movimiento (manual, fijo, ajuste, valuación, programado). Un programado que entra por el bot tiene que seguir siendo `SCHEDULED` para que valgan las reglas de compromisos y "Para confirmar". Por dónde entró se guarda aparte, en `channel` (`APP` | `TELEGRAM`) en `Transaction` y `CardCharge`. Sirve para `/deshacer` y para las métricas.
- **Alias a la cuenta, no al apartado.** Desde la iteración 6 los movimientos van al saldo de una cuenta; un alias de cuenta se resuelve a su saldo en la moneda del monto. `SourceAlias` apunta a una cuenta o a una tarjeta, con un check en SQL para que sea exactamente una.
- **Reglas del usuario en una tabla y reglas globales en la configuración.** Las del usuario apuntan a una categoría suya. Las globales son pocas, las mantiene el administrador y apuntan al *nombre* de una categoría sugerida, porque cada usuario tiene sus propias categorías; van en `Setting` (`merchant-rules`) como las categorías sugeridas, sin tabla nueva.
- **El parser corre en los dos lados.** Es una función pura de `libs/domain`: la web lo usa en el navegador (sin endpoint) y el backend en el bot. Las validaciones que dependen de datos quedan en el backend y en un helper de la web.
- **Vínculo por código de un solo uso.** Aleatorio, 10 minutos, guardado como hash con pepper (como el ticket de vinculación de Google). El `userId` nunca viaja por Telegram; la identidad es `telegramUserId`, único.
- **Borradores en la base, con vencimiento.** Un borrador tiene que sobrevivir a que Render se duerma entre el mensaje y el toque en "Confirmar". Vence a las 2 horas.
- **Idempotencia por `update_id`, en la misma transacción.** Así un reintento de Telegram no duplica nada y un error no pierde el mensaje.
- **Webhook directo a Render.** Pasar por el rewrite de Vercel agrega un salto y choca con `ORIGIN_SECRET`; la ruta del webhook se protege con el secret de Telegram.
- **Mensajes no entendidos 90 días.** Son datos del usuario (pueden tener montos y comercios): los ve y los borra él; el administrador solo ve conteos.
- **Sin cron.** La limpieza de vencidos corre al procesar updates y en `POST /sync`, como la generación de pendientes.

## Consecuencias

- Una migración con el enum `Channel`, la columna `channel` en dos tablas y siete tablas nuevas, más el valor `merchant-rules` sembrado.
- El primer mensaje después de un rato sin uso tarda alrededor de un minuto mientras Render despierta. Si molesta: ping externo, instancia paga o VPS (fase 16).
- La IA de respaldo (BOT-07, fase 34) podrá usar `UnparsedMessage` para decidir con datos si hace falta, sin cambiar este esquema.
