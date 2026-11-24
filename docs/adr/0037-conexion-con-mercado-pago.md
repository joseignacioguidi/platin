# 0037 — Conexión con Mercado Pago

Fecha: 2026-11-23 · Iteración 14, fases 40 y 41 (MPG-01 a 10)

## Contexto

Cargar cada movimiento de Mercado Pago a mano es lo que más se repite en el uso diario, y es la billetera que casi todos los usuarios tienen. Mercado Pago tiene una API pública con OAuth para que una aplicación lea la cuenta de otra persona, y avisos al momento (webhooks) firmados. Ninguna otra billetera argentina ofrece algo equivalente hoy: Ualá Bis solo expone sus cobros, y los bancos solo se alcanzan con agregadores pagos.

La API de Mercado Pago está pensada para vendedores: los cobros están bien cubiertos, pero no está confirmado qué informa de lo que una persona paga, transfiere o mueve entre reservas. Por eso la iteración arranca con una prueba técnica (fase 40) antes de escribir pantallas.

Decisiones del dueño del producto: para todos los usuarios, con un movimiento por día en el plan Gratis; los movimientos entran confirmados y, si no hay categoría, quedan para categorizar; las reservas se reflejan como transferencias entre apartados; avisos al momento por webhook.

## Decisiones

- **Una interfaz y no código de Mercado Pago repartido.** `AccountFeedProvider` (autorizar, canjear el código, renovar, validar un aviso, leer un movimiento y listar desde un cursor) devuelve movimientos ya normalizados (`ExternalMovementInput`). Mercado Pago es su primera implementación, como DolarApi lo es de `RateProvider`. Las rutas y las tablas usan `provider` y no el nombre de Mercado Pago, así otra conexión no cambia el esquema.
- **Sin SDK de Mercado Pago.** Son pocos endpoints HTTP (OAuth, pagos, reportes) y la firma de los avisos es un HMAC-SHA256: alcanza con `fetch` y `node:crypto`, igual que el `TelegramClient`. No se agregan dependencias.
- **Las reglas, puras.** Qué se crea a partir de un movimiento (ingreso, gasto, transferencia, vínculo con uno ya cargado, "Para revisar" o fuera del límite) lo decide `planExternalMovement` en `libs/domain`, con los ejemplos de la regla como tests. El backend solo junta el contexto y escribe.
- **Confirmados, con red de seguridad.** Entrar confirmado hace que el saldo de platin acompañe al de Mercado Pago sin pasos extra, pero trae dos riesgos: duplicar lo que ya se cargó a mano o por Telegram, y contar como gasto lo que fue una transferencia propia o el pago de una tarjeta. Se cubren con la búsqueda de duplicados (mismo monto exacto, ±2 días) y con convertir un movimiento en transferencia o en pago de tarjeta desde su detalle.
- **Sin categoría antes que una categoría inventada.** `Transaction.categoryId` ya admite nulo. Lo que no tiene regla queda sin categoría y se ve en "Para categorizar"; categorizarlo ofrece crear la regla, así la próxima vez entra solo.
- **"Para revisar" en lugar de errores.** Lo que no se puede ubicar (reserva sin asignar, moneda no activada o que la cuenta no tiene) se guarda como `ExternalMovement` retenido y se aplica al resolverlo. Un aviso de Mercado Pago nunca se responde con error por un problema de datos del usuario: se responde 200 y queda retenido.
- **Aviso al momento y sincronización de respaldo.** El webhook da la inmediatez; `POST /sync` (al abrir la app) lista lo ocurrido desde el último cursor y recupera lo que el webhook no trajo (Render dormido, un aviso perdido, un tipo de movimiento que Mercado Pago no avisa). La idempotencia por `(connectionId, externalId)` hace que los dos caminos no dupliquen.
- **El aviso no se cree: se consulta.** El cuerpo del webhook solo trae el id y el usuario de Mercado Pago. Después de validar la firma, el servidor lee el movimiento con el token de ese usuario y procesa lo que devuelve la API.
- **Webhook directo a Render**, como el de Telegram: fuera de `ORIGIN_SECRET` y sin JWT, protegido por la firma `x-signature` con `MERCADOPAGO_WEBHOOK_SECRET`, comparada en tiempo constante y con un margen de 5 minutos sobre su `ts`.
- **Credenciales cifradas.** El access token (180 días) y el refresh token se guardan con AES-256-GCM y una clave de `FEED_TOKEN_KEY`; nunca se devuelven al cliente ni se escriben en logs. Se renuevan en `POST /sync` cuando faltan menos de 30 días para el vencimiento.
- **El límite diario es un límite nuevo del plan.** `maxFeedMovementsPerDay` en `Plan.limits` (Gratis 1, Pro sin límite), con `checkDailyLimit` en `libs/domain`. Lo que pasa el límite no se guarda: solo un contador por día para el aviso. Guardarlo para dárselo al pasar a Pro sería guardar datos financieros que la persona no eligió traer.
- **Lo anterior a la conexión no se trae.** El saldo inicial ya lo cargó la persona (onboarding o ajuste); traer historial duplicaría lo cargado a mano. Al conectar se ofrece ajustar el saldo al de Mercado Pago.

## Consecuencias

- `Channel` suma `MERCADO_PAGO`. Las métricas, `/deshacer` del bot y la marca en Movimientos ya distinguen por canal.
- Aparecen movimientos sin categoría en la práctica: presupuestos, reportes y gráficos tienen que mostrar "Sin categoría" en vez de asumir que siempre hay una.
- Hay que crear y mantener una aplicación en Mercado Pago Developers (credenciales, URL de retorno, URL del webhook y su clave). Sin las variables de entorno, la conexión está apagada y la sección del perfil no aparece.
- Si la fase 40 muestra que la API no informa algún tipo de movimiento, ese tipo se sigue cargando a mano y se dice en el perfil ("Mercado Pago no nos avisa de…"); el resto del diseño no cambia. Lo que se encuentre se registra en un ADR de la fase 40.
- Sumar otra institución es una implementación nueva de `AccountFeedProvider` y un valor nuevo de `FeedProvider`, más sus reglas de normalización.
