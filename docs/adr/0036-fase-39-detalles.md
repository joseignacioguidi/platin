# 0036 — Detalles del onboarding (fase 39)

Fecha: 2026-11-08 · Iteración 13, fase 39 (AUTH-05, AUTH-11). Completa el ADR 0035.

## Contexto

La especificación, la arquitectura y los mockups del onboarding dejan algunos puntos sin definir: cuándo vuelve la tarjeta después de "Ahora no", qué pasa con los consumos si no hay tarjeta, en qué categorías caen los fijos y los consumos que se cargan sin elegir una, y dónde se dibuja el recorrido.

## Decisiones

- **"Ahora no" hasta el próximo ingreso** = hasta la próxima vez que se inicia sesión (contraseña, Google o registro): `AuthService.startSession` borra `dismissedAt`. Renovar el token (refresh) o recargar la página no cuenta como ingreso.
- **Saltear las tarjetas saltea sus consumos** (`markOnboardingStep` en `libs/domain`), salvo que ya se hayan cargado. Así "No tengo tarjeta" deja el paso 2 completo y la tarjeta del inicio no pide consumos de una tarjeta que no existe. Con tarjetas cargadas, "Saltear este paso" deja los consumos en "más tarde".
- **Un paso ya terminado no reabre el onboarding**: marcar un paso cuando `status` es `DONE` no lo vuelve a `IN_PROGRESS` (solo "Empezar de cero" lo reabre).
- **Categorías**: cada chip de fijos va a una categoría sugerida por nombre (Sueldo → Sueldo; Alquiler y Expensas → Alquiler; Luz, Gas, Internet y Celular → Servicios; Gimnasio → Salud; Spotify y Netflix → Suscripciones; "Otro" → Otros gastos u Otros ingresos). Los consumos actuales y "Compras anteriores" van a "Otros gastos". Si el usuario ya no tiene esa categoría, se usa "Otros" y, si tampoco, la primera de ese tipo. Se cambian después como cualquier movimiento.
- **Cuenta sugerida**: el sueldo y los gastos van a la primera cuenta de banco o billetera elegida; Spotify y Netflix, a la primera tarjeta. La tarjeta se paga, por defecto, desde esa misma cuenta.
- **Pantalla completa**: `/app/bienvenida/:paso` es una ruta propia, fuera del shell (sin barra de navegación ni +), protegida con el mismo `authGuard`. `/app/bienvenida` lleva al paso 1.
- **"Empezar de cero"** lleva directo a `/app/bienvenida/cuentas`; sale el aviso "Listo, empezaste de cero" del inicio.
- **"Volver" muestra lo cargado**: cuentas, tarjetas y fijos ya creados aparecen con un botón para editarlos en las hojas de siempre; los consumos de una tarjeta se leen de `GET /charges?cardId=` y "Compras anteriores" se edita en vez de duplicarse.
- **Métricas**: "cuentas nuevas" son las registradas en las últimas 12 semanas (como las altas por semana) que tienen estado de onboarding; el último paso tocado es el último, en orden, que no está `PENDING`.

## Consecuencias

- Los tests e2e que daban por hecha la cuenta "Efectivo" la crean en su preparación, como lo haría el paso 1.
- La tarjeta del libre dice "Todavía sin fijos ni consumos de tarjeta." (o solo lo que falte) mientras esos pasos sigan pendientes, como en el mockup "Inicio a medias".
