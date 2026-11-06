# Bot de Telegram: cómo ponerlo en marcha

Guía para prender el bot de platin (BOT-01 a 06), probarlo y resolver problemas. El diseño está en `docs/adr/0026-carga-por-texto-y-telegram.md` y las decisiones de implementación en `docs/adr/0028-decisiones-del-bot.md`.

## Cómo funciona, en una línea

Telegram le manda cada mensaje a la API en Render (`POST /api/v1/telegram/webhook`, directo, sin pasar por Vercel). La API interpreta el texto, responde con lo que entendió y guarda el movimiento recién cuando la persona toca **Confirmar**.

Sin `TELEGRAM_BOT_TOKEN`, el bot está apagado: el webhook responde 404 y la sección Perfil › Telegram no aparece. El resto de la app funciona igual.

## 1. Crear el bot en Telegram

1. En Telegram, abrí **@BotFather** y mandá `/newbot`.
2. Elegí el nombre visible (por ejemplo, `platin`) y el usuario del bot, que tiene que terminar en `bot` (por ejemplo, `platin_finanzas_bot`).
3. BotFather te da el **token**, algo como `123456789:AAH...`. Guardalo: es la llave del bot.
4. Opcional, también en BotFather:
   - `/setdescription` y `/setabouttext`: un texto como "Cargá tus gastos en platin escribiendo una línea".
   - `/setuserpic`: el ícono de `docs/brand/`.
   - `/setjoingroups` → **Disable**. El bot solo atiende chats privados.

Los comandos (`/libre`, `/hoy`…) no hace falta cargarlos a mano: los configura el paso 4.

## 2. Generar los dos secretos

Hacen falta dos valores aleatorios de 32 caracteres o más:

| Variable | Para qué | Caracteres permitidos |
| --- | --- | --- |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram lo manda en cada pedido y la API lo verifica | Solo `A-Z`, `a-z`, `0-9`, `_` y `-` |
| `TELEGRAM_CODE_PEPPER` | Se mezcla en el hash de los códigos de vinculación | Cualquiera |

Con Node (funciona en Windows sin instalar nada más):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # webhook secret
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))" # pepper
```

Usá un valor distinto para cada uno.

## 3. Cargar las variables en Render

En el servicio de la API en Render, **Environment**, agregá las cuatro:

| Variable | Valor |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | El token de BotFather |
| `TELEGRAM_BOT_USERNAME` | El usuario del bot, **sin** `@` (`platin_finanzas_bot`) |
| `TELEGRAM_WEBHOOK_SECRET` | El primer secreto |
| `TELEGRAM_CODE_PEPPER` | El segundo secreto |

Guardá y dejá que Render redespliegue.

> Si cargás el token y falta alguna de las otras tres, la API **no arranca**: el log de Render dice cuál falta ("Required with TELEGRAM_BOT_TOKEN"). Es a propósito, para no quedar con un bot a medio configurar.

En Vercel no hay que cambiar nada.

## 4. Apuntar el webhook a Render

Esto se hace una vez (y de nuevo si cambiás el token, el secreto o la URL de Render). Necesitás la URL **directa** del servicio de Render, la `https://<servicio>.onrender.com`, no la de Vercel. Es el mismo valor que `API_DIRECT_URL` en Vercel.

Desde tu máquina, en la raíz del repo, con el token y el secreto **iguales a los de Render**:

**PowerShell**

```powershell
$env:TELEGRAM_BOT_TOKEN = "123456789:AAH..."
$env:TELEGRAM_WEBHOOK_SECRET = "el-mismo-secreto-que-en-render"
pnpm nx run api:telegram-setup --args="--url=https://<servicio>.onrender.com"
```

**Bash**

```bash
TELEGRAM_BOT_TOKEN="123456789:AAH..." TELEGRAM_WEBHOOK_SECRET="el-mismo-secreto" \
  pnpm nx run api:telegram-setup --args="--url=https://<servicio>.onrender.com"
```

(También los podés poner en tu `.env` local, que Nx carga solo. No los commitees: `.env` está en `.gitignore`.)

Tiene que imprimir:

```
setWebhook: ok
setMyCommands: ok
```

El script configura el webhook en `https://<servicio>.onrender.com/api/v1/telegram/webhook`, con el secreto, solo para mensajes y botones (`message` y `callback_query`) y sin descartar mensajes pendientes, y carga la lista de comandos.

### Verificar que quedó bien

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Mirá que:

- `url` termine en `/api/v1/telegram/webhook`;
- `pending_update_count` sea 0, o que baje después de mandar un mensaje;
- no haya `last_error_message`. Si hay, buscalo en [Problemas comunes](#problemas-comunes).

## 5. Vincular tu cuenta

1. En platin, **Perfil › Telegram › Vincular**.
2. Desde el celular: tocá **Abrir el bot en Telegram** y después **Iniciar** (Start). El bot te da la bienvenida.
3. Desde otro dispositivo: abrí el bot en Telegram y mandale el comando que muestra la pantalla, `/vincular ABCD2345`.

El código sirve **una sola vez** y vence a los **10 minutos**. El perfil se actualiza solo cuando el vínculo queda hecho.

- Una cuenta de Telegram queda vinculada a una sola cuenta de platin y viceversa. Vincular otra reemplaza la anterior.
- Para desvincular: **Perfil › Telegram › Desvincular**, o `/desvincular` en el chat.

## 6. Usarlo

Mandale una línea, igual que en el modo "Escribir" de la carga rápida:

| Mensaje | Qué entiende |
| --- | --- |
| `café 3500` | Gasto de $ 3.500, hoy |
| `super 45k visa 3c` | Compra de $ 45.000 en 3 cuotas con la tarjeta "visa" |
| `+ 50000 freelance` | Ingreso de $ 50.000 |
| `sueldo 1.800.000 mp` | Ingreso en la cuenta "mp" |
| `netflix usd 20` | Gasto de USD 20 |
| `taxi 8000 ayer` | Gasto del día anterior |
| `turno médico 15000 el 20 que viene` | Gasto programado |

El bot responde con lo que entendió y estos botones:

- **Confirmar**: guarda. Si no hay categoría, primero hay que elegir una.
- **Cambiar categoría**: hasta 8 opciones y **Otra**, para escribir el nombre. Si la categoría no existe, la crea. Después ofrece una regla: "¿La próxima vez *coto* va a Supermercado?".
- **Cambiar cuenta**: tus cuentas y, para un gasto, tus tarjetas.
- **Cancelar**.

Nada se guarda hasta tocar Confirmar. Un borrador vence a las **2 horas**.

**Comandos:** `/libre` (cuánto te queda este mes), `/hoy` (lo cargado hoy), `/pendientes` (para confirmar, con botón), `/proximos` (los próximos 5 pagos), `/deshacer` (borra lo último que cargaste por el bot en las últimas 24 horas), `/ayuda` y `/desvincular`.

### Para que entienda mejor

- **Nombres para escribir**: en el formulario de cada cuenta y tarjeta, agregá alias cortos (`mp`, `efe`, `visa`). Sin alias, usa la última cuenta o tarjeta que usaste.
- **Reglas**: en **Categorías › Reglas**, "si el motivo dice *coto*, la categoría es Supermercado". Las reglas que creás desde el bot aparecen ahí.
- **Mensajes no entendidos**: en **Perfil › Telegram** ves lo que el bot no pudo interpretar (se guarda 90 días) y lo podés borrar.

## 7. El servidor dormido de Render

El plan gratuito de Render apaga la API después de 15 minutos sin tráfico, y tarda alrededor de un minuto en despertar. Telegram reintenta los mensajes que no recibieron respuesta durante hasta 24 horas, y la API descarta los repetidos, así que el primer mensaje del día llega tarde pero llega una sola vez.

Si la demora molesta, programá un ping a `https://<servicio>.onrender.com/api/v1/health` cada 14 minutos con un servicio externo gratuito (UptimeRobot, cron-job.org). Entra en las 750 horas mensuales del plan gratuito. La otra opción es una instancia paga.

## Probar en local

Telegram solo llama a URLs públicas con https, así que en local hay dos caminos.

**A. Simular los mensajes (sin bot real).** Levantá la API con valores de prueba:

```bash
TELEGRAM_BOT_TOKEN=000:local TELEGRAM_BOT_USERNAME=platin_local_bot \
TELEGRAM_WEBHOOK_SECRET=local-webhook-secret-with-32-chars-min \
TELEGRAM_CODE_PEPPER=local-code-pepper-with-at-least-32-chars \
pnpm nx serve api
```

y mandá updates a mano:

```bash
curl -X POST http://localhost:3000/api/v1/telegram/webhook \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: local-webhook-secret-with-32-chars-min" \
  -d '{"update_id":1,"message":{"message_id":1,"from":{"id":42,"first_name":"Yo"},"chat":{"id":42,"type":"private"},"text":"/start CODIGO"}}'
```

Usá un `update_id` distinto en cada pedido: uno repetido se ignora. Las respuestas del bot no llegan a ningún lado porque el token es falso (el log muestra el aviso), pero los vínculos, borradores y movimientos se guardan igual y se ven en la app.

Los tests automáticos (`npx vitest run src/telegram` en `apps/api`) hacen esto mismo con un Telegram falso.

**B. Con un bot real.** Creá **otro bot** solo para pruebas en BotFather (no uses el de producción). Exponé tu API con un túnel (`cloudflared tunnel --url http://localhost:3000` o `ngrok http 3000`) y corré el paso 4 con el token del bot de prueba y la URL del túnel.

## Problemas comunes

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| La API no arranca en Render: "Required with TELEGRAM_BOT_TOKEN" | Falta una de las otras tres variables | Cargá las cuatro (paso 3) |
| La API no arranca: error en `TELEGRAM_WEBHOOK_SECRET` | Tiene caracteres no permitidos o menos de 32 | Generalo de nuevo con el comando del paso 2 (hex) |
| `getWebhookInfo` muestra `401 Unauthorized` | El secreto con el que corriste el setup no es el de Render | Corré el paso 4 de nuevo con el mismo secreto que en Render |
| `getWebhookInfo` muestra `404 Not Found` | La API no tiene el token cargado, o la URL está mal | Revisá las variables en Render y que la URL termine en `.onrender.com` |
| `Connection timed out` o `pending_update_count` crece | Render está despertando o caído | Esperá un minuto; si sigue, mirá los logs de Render |
| "Este chat no está vinculado a platin" | No vinculaste, o desvinculaste | Paso 5 |
| "Ese código ya no sirve" | Pasaron 10 minutos o ya se usó | Generá otro en Perfil › Telegram |
| "Tu cuenta de platin está suspendida" | El administrador suspendió la cuenta | Hablalo con el administrador |
| "Este borrador venció. Mandalo de nuevo." | Pasaron más de 2 horas, o el botón es de otro chat | Mandá el mensaje otra vez |
| "Vas muy rápido. Esperá un minuto." | Más de 30 mensajes en un minuto | Esperá un minuto |
| No aparece Perfil › Telegram | El bot está apagado (sin token en la API) | Paso 3 |
| El bot no responde en un grupo | Solo atiende chats privados | Hablale por privado |

## Seguridad

- El token es la llave del bot: nunca lo commitees ni lo pegues en un issue. Si se filtra, en BotFather `/revoke` genera uno nuevo. Cargalo en Render y corré el paso 4 otra vez.
- El `userId` de platin nunca viaja por Telegram. La identidad es la cuenta de Telegram vinculada, y cada botón lleva solo el id de su borrador, que la API verifica contra el chat.
- Los saldos de las cuentas no se consultan por el bot, porque los mensajes quedan guardados en Telegram.
- El administrador ve solo conteos del bot (usuarios vinculados, mensajes por semana, porcentaje no entendido), nunca el contenido.

## Apagar el bot

1. Borrá `TELEGRAM_BOT_TOKEN` en Render. Las otras tres pueden quedar.
2. Sacá el webhook para que Telegram deje de llamar:

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
   ```

Los vínculos y las reglas quedan guardados: si lo volvés a prender, siguen funcionando.
