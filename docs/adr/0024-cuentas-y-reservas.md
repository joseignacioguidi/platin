# 0024 — Cuentas y reservas: pagar la tarjeta desde una reserva para gastar

Fecha: 2026-11-04 · Fase 29 (CTA-02 a 06, MOV-01, 02, DAS-05, COM-02, 04)

## Contexto

La iteración 6 dice que ingresos, gastos, fijos, programados y pagos de tarjeta van siempre al saldo de una cuenta (`AVAILABLE`). Pero la reserva **para gastar** (`SPENDING`) se describe como "un sobre para gastos del mes o para pagar la tarjeta" (CTA-02): si el pago del resumen no puede salir de ella, la plata de la reserva "Cuotas" tiene que pasar primero al saldo de la cuenta.

## Decisiones

**Pagar la tarjeta (ADR propio, acordado con el usuario).**

- `POST /statements/:id/payments` y el `defaultPaymentPocketId` de una tarjeta aceptan el saldo de una cuenta o una reserva para gastar. Una reserva de ahorro o inversión responde `ACCOUNT_BALANCE_REQUIRED` (422).
- Ingresos, gastos, programados y fijos siguen yendo solo al saldo de una cuenta, como dice la especificación.
- `payFrom` en Compromisos muestra la reserva cuando la cuenta de pago de la tarjeta es una reserva para gastar.
- En el libre no cambia nada: pagar desde una reserva para gastar baja "en tus cuentas" lo mismo que pagar desde el saldo y saca el resumen de "a pagar".

**Detalles que la arquitectura no fijaba.**

- `PATCH /transactions/:id` valida `ACCOUNT_BALANCE_REQUIRED` solo cuando cambia `pocketId`. La base de producción se recrea, así que no hay movimientos viejos en reservas.
- Un saldo en otra moneda (`POST /accounts/:id/pockets` con `kind: AVAILABLE`) siempre se llama "Disponible"; el nombre del request se ignora. La interfaz lo muestra como la cuenta ("Galicia · USD").
- Renombrar o archivar a mano el saldo de una cuenta responde `ACCOUNT_BALANCE_LOCKED` (422). Un cambio de tipo hacia o desde `AVAILABLE` responde `POCKET_KIND_NOT_ALLOWED` (422).
- `TRANSFER_INTENT_MISMATCH` desaparece: el `intent` del request se ignora y la intención se calcula con `transferIntent`, que ahora da `MOVE` para lo que entra o sale de una reserva para gastar.
- `saved` del inicio usa `savedThisMonth` (reemplaza a `separatedThisMonth`): del saldo o de una reserva para gastar hacia ahorro o inversión suma, lo inverso resta.
- "Tarjeta de los meses siguientes" y "en tus cuentas" se valúan con la cotización de hoy, como el resto del libre.
- Un mes anterior muestra solo "en tus cuentas" al último día del mes, también con la cotización de hoy.
- Las cuotas de compras en otra moneda se valúan en `cardLater` con la cotización de hoy; `spent` sigue usando la cotización de la fecha de la compra.
- La migración agrega `SPENDING` en una migración aparte (Postgres no deja usar un valor nuevo de un enum en la misma transacción que lo agrega) y en la siguiente convierte los `AVAILABLE` sobrantes y crea el índice único parcial `Pocket_account_balance_key`.

## Consecuencias

- La regla "pagos de tarjeta van siempre al saldo de una cuenta" de la especificación tiene una excepción: también desde una reserva para gastar. Conviene ajustar el texto de "Cuentas y reservas" en `docs/especificacion.md`.
- Los ítems de Compromisos suman `cardId` (resumen y fijo en tarjeta), para que la fase 30 abra la tarjeta desde "Sin cuenta asignada".
