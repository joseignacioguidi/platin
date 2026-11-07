# 0031 — Navegación reagrupada

Fecha: 2026-11-06 · Fase 36 (NAV-01 a 03, AUTH-10, COM-05, INV-06)

## Contexto

La barra lateral de escritorio listaba las 12 secciones sueltas (Inicio, Movimientos, Cuentas, Tarjetas, Compromisos, Ahorros y metas, Inversiones, Fijos, Categorías, Para confirmar, Perfil y preferencias, Administración) y "Más" en celular tenía 8. Varias hablan de lo mismo:

- Fijos y Para confirmar alimentan a Compromisos: un fijo es una de las fuentes de lo comprometido y lo que se confirma son los movimientos de esos fijos.
- Ahorros ya mostraba las reservas de inversión junto a las de ahorro, e Inversiones se abría desde un botón de Ahorros con una flecha para volver.
- Categorías (con su pestaña Reglas) es personalización, como el perfil.

`docs/arquitectura.md` > "Rutas y renderizado" tenía una ruta propia para cada una.

## Decisión

- **Seis secciones** en la barra lateral: Inicio, Movimientos, Cuentas, Tarjetas, Compromisos y Ahorros e inversiones. Al pie: Administración (solo administradores), el acceso al perfil con el nombre del usuario, y los botones de ícono de ocultar montos y modo oscuro.
- **Compromisos con tres pestañas**, cada una una ruta hija: `/app/compromisos` (Próximos meses), `/app/compromisos/fijos` y `/app/compromisos/para-confirmar`. El ítem de la barra muestra cuántos movimientos hay para confirmar.
- **Ahorros e inversiones con dos pestañas**: `/app/ahorros` (Metas y ahorros) e `/app/ahorros/inversiones`. "Actualizar valores" sigue en `/app/inversiones/actualizar`.
- **Perfil y ajustes** sigue en `/app/perfil` (la usan el ingreso con Google y los mensajes del bot) y suma la tarjeta Personalización con Categorías y Reglas. Categorías sigue en `/app/categorias`, pero sale de la barra.
- **Redirecciones** de las rutas viejas, sin `pathMatch: 'prefix'` para no capturar `/app/inversiones/actualizar`:
  - `/app/fijos` → `/app/compromisos/fijos`
  - `/app/pendientes` → `/app/compromisos/para-confirmar`
  - `/app/inversiones` → `/app/ahorros/inversiones`
- **El contador de pendientes** sale de `GET /movements?status=PENDING&until=<hoy>&limit=100`, la misma consulta que la pestaña Para confirmar, y se recarga con la clave `movements` del `RefreshBus`. Con 100 o más muestra "99+". No hace falta un endpoint nuevo.
- **Sin cambios de esquema ni de API.**

## Consecuencias

- Las pantallas de Compromisos y de Ahorros e inversiones pasan a tener un componente de sección (encabezado + pestañas + `router-outlet`), y las páginas actuales pierden su título propio.
- Los accesos del inicio (DAS-04), los avisos y "Para pagar este mes" siguen funcionando por las redirecciones; conviene igual apuntarlos a las rutas nuevas.
- El ícono de modo oscuro deja la tarjeta Apariencia del perfil; en celular, ocultar montos y modo oscuro pasan a "Más".
- `docs/arquitectura.md` > "Rutas y renderizado" se actualiza con las rutas nuevas.
