# 0035 — Onboarding

Fecha: 2026-11-08 · Iteración 13, fase 39 (AUTH-05, AUTH-11)

## Contexto

Hasta ahora, al registrarse, platin creaba la cuenta "Efectivo" en $ 0 y las categorías sugeridas, y dejaba a la persona en un inicio vacío. "Libre este mes" depende de tres cosas que se cargan a mano (saldos de hoy, deuda de tarjeta y fijos): sin ellas, el primer número sale mal y la app pierde credibilidad.

## Decisiones

- **Recorrido de cuatro pasos, todo salteable**, que crea datos reales con los endpoints de siempre. No hay un "guardar al final": si la persona corta, lo cargado queda.
- **Estado en `User.preferences`**, no en una tabla nueva: es un dato del usuario, chico, que solo lee el propio usuario y que no necesita consultas cruzadas. Las métricas del administrador lo leen con una consulta sobre el JSON.
- **Las cuentas existentes no ven el onboarding**: sin `onboarding` en las preferencias, cuentan como terminadas.
- **"Efectivo" deja de crearse solo**: se crea si queda elegido en el paso 1. Cambia `UserOnboardingService` y la regla de "Empezar de cero" (que recreaba Efectivo): ahora vuelve a abrir el onboarding.
- **Fijos cuyo día ya pasó empiezan el mes que viene**, porque el saldo de hoy ya los incluye. Sin esto, un sueldo cargado a mitad de mes contaría dos veces. Se usa el `startPeriod` que `FixedItem` ya tiene.
- **"Lo demás del resumen abierto" como un solo consumo** ("Compras anteriores"), para no pedir compra por compra lo que ya está en el resumen.
- **Sin Telegram en el onboarding**: se ofrece desde el perfil cuando ya hay datos.

## Consecuencias

- Sin migración. Cambian el registro, "Empezar de cero" (AUTH-09) y el guard de `/app`.
- La regla de "Empezar de cero" de la especificación ("la cuenta Efectivo con su Disponible en pesos") queda reemplazada por "vuelve a abrir el onboarding".
