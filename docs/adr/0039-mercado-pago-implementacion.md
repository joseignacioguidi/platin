# 0039 — Conexión con Mercado Pago: decisiones de la implementación

Fecha: 2026-11-24 · Iteración 14, fase 41 (MPG-01 a 10). Complementa la 0037.

## Contexto

La fase 41 se implementó antes de la fase 40: la prueba técnica necesita la cuenta real de Mercado Pago, las credenciales de la aplicación en `.env` y unos días de uso, y nada de eso estaba disponible. El número 0038 queda reservado para el ADR de la fase 40 (`0038-api-de-mercado-pago.md`), que va a decir qué informa de verdad la API.

Mientras tanto, todo lo que depende de Mercado Pago está detrás de `AccountFeedProvider` y se probó con un proveedor falso. `MercadoPagoProvider` está armado con la documentación pública y tiene tests con respuestas armadas a mano, pero **no se probó contra la API real**. Al implementar aparecieron puntos que la especificación no resolvía; acá van las decisiones.

## Decisiones

**Esquema (diferencias con la arquitectura)**

- **`FeedSkippedMovement`**, una tabla nueva. Lo que pasa el límite diario no se guarda, pero un aviso repetido, o la sincronización que vuelve a leer el mismo movimiento, lo contaría de nuevo en "Hoy llegaron N más". La tabla guarda solo el id opaco de Mercado Pago (ni monto ni contraparte) y se limpia a los 8 días, uno más que la ventana de la sincronización. También se usa para lo que llega con el usuario suspendido.
- **`ExternalMovement` suma `direction` y `refundOf`**, solo para las devoluciones: hacen falta para volver a aplicar una devolución retenida y para armar el motivo "Devolución: {motivo original}".
- **`FeedConnection.accountId` es único** (una cuenta de platin, una conexión) y se pone en nulo si la cuenta se borra. Si la cuenta se archiva o se borra, la conexión vuelve a pedir la cuenta (`NEEDS_ACCOUNT` en la respuesta) y lo que llega queda en "Para revisar" con `NO_ACCOUNT`.
- **Un trigger en la base** pasa a `DISMISSED` el `ExternalMovement` cuando se borra su `Transaction` o su `Transfer`, venga el borrado de donde venga (la app, `/deshacer` del bot, borrar un fijo). Así "borrado, no vuelve a entrar" no depende de que cada camino se acuerde. Igualmente, como la fila sigue existiendo, el movimiento nunca se vuelve a procesar.

**Reglas que la especificación no cerraba**

- **Empate en "Ya lo cargaste"**: con dos candidatos a la misma distancia, gana la **fecha anterior** y, en el mismo día, el que **se cargó primero**. Es la lectura más literal de "el más viejo".
- **Solo candidatos confirmados**: no se vincula a un movimiento pendiente (un fijo sin confirmar, uno programado). Si se vinculara, el pendiente seguiría pendiente y la persona lo terminaría confirmando igual. Queda como mejora: confirmar el pendiente al vincularlo.
- **Rendimientos**: entran como **ingreso** (no como `YIELD`) en la categoría de sistema Rendimientos. `YIELD` es de las valuaciones de inversiones y no se edita ni se borra, y la MPG-08 pide que lo de Mercado Pago se pueda corregir. Un rendimiento busca duplicados entre los ingresos.
- **Devoluciones**: el proveedor dice para qué lado va la plata. Sin el original (anterior a la conexión) el motivo es "Devolución: {lo que informó Mercado Pago}". La categoría se busca con las reglas del tipo nuevo; como casi siempre apuntan a gastos, una devolución suele quedar en "Para categorizar".
- **"No es el mismo"** crea el movimiento aunque el día esté lleno en el plan Gratis: lo pidió la persona. Cuenta como creado.
- **Reglas sin el paso 3 de la carga por texto**: para un motivo de afuera solo se usan las reglas del usuario y las globales (`categoryByMerchantRules`). Adivinar por el comienzo del nombre de una categoría ("café" → "Cafetería") es demasiado suelto para algo que entra confirmado.
- **La cuenta conectada tiene que ser una billetera** (`FEED_ACCOUNT_KIND`), como dice la MPG-01.
- **Moneda que se cambia en FX sin el otro monto**: queda en "Para revisar" (`NO_BALANCE_IN_CURRENCY`) en lugar de inventar una transferencia.
- **"Para revisar" se puede descartar** (`DELETE /feeds/:provider/held/:id`, queda `DISMISSED`). Sin eso, un movimiento en una moneda que la persona no quiere activar quedaría para siempre.
- **Cuándo se vuelve a intentar "Para revisar"**: al asignar una reserva, al elegir la cuenta, en cada `POST /sync` y con `POST /feeds/:provider/held/retry` (el botón "Volver a intentar"). Activar una moneda no lo dispara solo: el módulo de usuarios no conoce las conexiones; lo resuelve la próxima sincronización o el botón.
- **Desconectar borra la conexión** con sus reservas y sus `ExternalMovement`. Lo que entró se queda, con `channel: MERCADO_PAGO`; las transferencias pierden la marca. Al reconectar se arranca desde ese momento, así que no vuelve a entrar nada viejo.
- **Volver a conectar** la misma cuenta de Mercado Pago sigue desde el cursor que tenía; otra cuenta de Mercado Pago reinicia el cursor y borra las reservas asignadas.

**API**

- **El filtro "Para categorizar" es `GET /movements?uncategorized=true`**, no `GET /transactions?uncategorized=true`: no existe un listado en `/transactions`, la lista de Movimientos es `/movements`. Trae ingresos y gastos confirmados sin categoría, de cualquier mes.
- **`POST /transactions/:id/convert`** recibe `{ to, toAccountId? , statementId? }` con un refine (un objeto plano en lugar de una unión discriminada, porque `nestjs-zod` arma la clase del DTO a partir del esquema). Para un ingreso, la transferencia viene **desde** la otra cuenta.
- **El pago de un resumen al convertir** reutiliza `StatementsService.payIn`: mismas validaciones que pagar desde la tarjeta (resumen cerrado, no más de lo pendiente).
- **Los movimientos de Mercado Pago no validan el límite de fecha futura** y congelan la cotización de su propio día.

**Web**

- La conexión vive en **`/app/perfil/mercado-pago`** (adonde vuelve el callback). El perfil muestra el estado en un renglón con el camino a esa pantalla, como pide AUTH-10 para el grupo 5.
- El aviso del inicio lleva a Movimientos con `?filtro=categorizar`, que selecciona el chip "Para categorizar".
- La oferta de regla al categorizar aparece solo si el movimiento era de Mercado Pago, no tenía categoría y la regla no existe.

## Consecuencias

- Hay que correr la fase 40 antes de habilitar la conexión en producción. Si la API no informa reservas, compras de moneda o rendimientos (los pagos sí están cubiertos), esos tipos se siguen cargando a mano y `normalizePayment` no cambia; si los informa por otro endpoint, se suma su normalización y la lista de `kind` no cambia.
- Puntos a verificar en la fase 40 y a ajustar en `MercadoPagoProvider`: el formato exacto de `x-signature` (`ts` en milisegundos o segundos: hoy se aceptan los dos), si el aviso trae el `user_id` del vendedor o del pagador, si `transaction_details.total_paid_amount` es lo que salió del saldo, y si el token se canjea por JSON o por formulario.
- Sin las cuatro variables de entorno de Mercado Pago, la conexión está apagada y la sección no aparece; `.env.example` las documenta.
