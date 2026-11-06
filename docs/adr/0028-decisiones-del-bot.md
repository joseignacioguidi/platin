# 0028 — Decisiones del bot de Telegram que la especificación no fijaba

Fecha: 2026-11-06 · Fase 33 (BOT-01 a 06)

## Contexto

La regla "Bot de Telegram" y el ADR 0026 definen el flujo. Al implementarlo quedaron huecos; estas son las decisiones tomadas, todas con tests en `apps/api/src/telegram/telegram.e2e-spec.ts`.

## Decisiones

- **Cuenta por defecto.** Si el texto no nombra cuenta ni tarjeta y no hay una última usada que encaje, el borrador va a la primera cuenta activa con saldo en la moneda del monto (en el orden de la app). Si ninguna tiene esa moneda, la primera cuenta, y la validación responde `NO_BALANCE_IN_CURRENCY`.
- **"Otra" categoría.** El nombre escrito se busca entre las categorías del tipo (igual, o el único nombre que empieza así). Si no hay ninguna, se crea con ícono `tag` y color `muted`, como desde el selector de la app (CAT-06).
- **Orden de "Cambiar categoría".** Primero las usadas hace poco (movimientos y consumos cargados a mano o por el bot), después las sugeridas más comunes (el mismo orden que la web) y después el resto por nombre; hasta 8.
- **La regla que ofrece el bot** usa la primera palabra del motivo, normalizada (2 letras o más). Si el usuario ya tenía una regla con ese texto, aceptar la cambia a la nueva categoría.
- **Escrituras en la transacción del update.** `TransactionsService.createIn`, `confirmIn` y `ChargesService.createIn` escriben con el cliente de la transacción del webhook; las validaciones de negocio corren antes de escribir, así un error de negocio (moneda sin activar, sin cotización) se contesta como mensaje sin abortar la transacción. La app sigue usando `create` y `confirm`, que llaman a lo mismo.
- **`/hoy`** muestra lo *cargado* hoy (por fecha de carga en Buenos Aires, desde la app o el bot), no lo fechado hoy; el total suma los gastos y consumos por moneda.
- **`/proximos`** toma los próximos pagos del inicio (resúmenes, fijos y programados de los próximos 30 días) y muestra los primeros 5 que son salidas de plata.
- **`/deshacer`** solo ofrece el último movimiento o consumo entrado por el bot en 24 horas; el botón "Sí, borrar" vuelve a verificar que siga siendo el último antes de borrar.
- **Mensajes no entendidos.** Se guardan solo los errores del parser. Los errores de datos (moneda sin activar, cuenta sin saldo en esa moneda) no son el parser fallando y no se guardan.
- **Métricas del bot.** Los borradores se borran al vencer, así que "mensajes por semana" cuenta los movimientos y consumos entrados por Telegram más los mensajes no entendidos. Los borradores cancelados o vencidos no cuentan. Es una aproximación sin cambiar el esquema.
- **Limpieza.** Al vencer se borra cualquier borrador, también los confirmados: después de 2 horas un botón viejo responde "venció". También se borran los códigos de vinculación vencidos.
- **Bot apagado.** Sin `TELEGRAM_BOT_TOKEN`, `GET /telegram/link` responde `enabled: false` (la web oculta la sección), y el webhook y `POST /telegram/link-code` responden 404.
- **Configurar el webhook.** `nx run api:telegram-setup` necesita la URL de Render (`--url=` o `TELEGRAM_WEBHOOK_BASE_URL`), porque el webhook no pasa por Vercel.
- **Marca en Movimientos.** "· Telegram" al final del subtítulo, en texto y sin un color nuevo.

## Consecuencias

- Las respuestas de movimientos (`GET /movements`) incluyen `channel`.
- Si más adelante se quieren métricas exactas de mensajes, hace falta un contador propio (una tabla o una columna), que es un cambio de esquema.
