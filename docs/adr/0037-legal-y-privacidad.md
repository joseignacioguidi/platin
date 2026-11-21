# 0037 — Legal y privacidad

Fecha: 2026-11-21 · Iteración 14, fase 40 (LEG-01 a 04)

## Contexto

Para abrir platin al público hacen falta política de privacidad y términos, constancia de que cada persona los aceptó, y los derechos de acceso y supresión de la Ley 25.326 resueltos desde la app. El borrado de usuario ya existía para el administrador (`deleteUser`), pero dejaba filas del registro de auditoría.

## Decisiones

- **Textos en Markdown en `docs/legal/`**, versionados con el código y con la fecha como versión. Una sola versión para los dos documentos: se aceptan juntos.
- **HTML generado en el build** con `marked` (dependencia nueva, solo de build): las páginas legales quedan prerenderizadas y sin pedidos a la API, como la landing.
- **Aceptación en el usuario** (`acceptedLegalVersion`, `acceptedLegalAt`) y no en una tabla de historial: alcanza con saber qué versión vigente aceptó y cuándo. Si hiciera falta el historial completo, se agrega después sin romper esto.
- **El servidor guarda la versión vigente**, no la que manda el cliente, y rechaza un registro con una versión vieja: así una pestaña abierta desde antes del cambio no registra una aceptación desactualizada.
- **Guard global** para la aceptación pendiente, con una lista corta de excepciones que permiten descargar los datos y eliminar la cuenta sin aceptar.
- **Eliminar es borrar, no anonimizar**, salvo `AuditLog.actorId` de acciones de administradores, que queda en `null` para conservar la acción sin la persona.
- **Un último mensaje por Telegram** al borrar, mandado después de confirmar la transacción para que un error de Telegram no impida el borrado.
- **Tests que leen el modelo de Prisma** para "no queda nada" y para la exportación: una tabla nueva con datos del usuario los rompe hasta que se la tenga en cuenta.
- **Respaldos**: plan gratuito de Neon, 6 horas de historial y sin snapshots. Queda escrito en la política y en la especificación.

## Consecuencias

- Una migración: dos columnas en `User` y `AuditLog.actorId` opcional.
- Todas las cuentas existentes ven "Actualizamos los términos" la primera vez que entren después del despliegue.
- Cambiar los textos legales es: editar el Markdown, cambiar la fecha en el front matter y en `LEGAL_VERSION`, y desplegar. Cada persona los vuelve a aceptar al entrar.
- Si se pasa a un plan pago de Neon o se saca un snapshot, hay que actualizar la política (plazo de los respaldos).
