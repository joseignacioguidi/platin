# Inicio (iteración 7) — design reference

Mockups del inicio rediseñado (fase 31), exportados del canvas de diseño. Son una REFERENCIA, no código de producción: los valores de diseño (colores, tamaños, espaciados, radios, orden de las secciones) están en los `style="…"` y hay que replicarlos con los tokens de Tailwind y los componentes de `libs/web-ui`, no copiar el markup.

## Contenido

- `Celular.dc.html` — el inicio en un celular (390 px).
- `Escritorio.dc.html` — el inicio en escritorio (1440 px), con barra lateral y columnas; a menos ancho las columnas se apilan.
- `Accesos.dc.html` — el bloque de accesos solo: sin tarjetas ni colores, ícono en tinta dentro de un círculo de borde fino.
- `support.js`, `vendor/react*.js` — el runtime que dibuja los mockups en el navegador; no es parte del diseño.

## Datos

Los montos de la tarjeta "Te quedan para gastar este mes" son reales y coherentes entre sí. Los movimientos, los pagos (los que dicen `[MONTO]`), las metas y sus objetivos son de ejemplo.

La tipografía de los mockups es Hanken Grotesk porque Uncut Sans no estaba disponible en el editor; la app usa Uncut Sans y JetBrains Mono como siempre.

## Ver

Serví la carpeta (por ejemplo `python3 -m http.server`) y abrí cada `.dc.html`; algunos navegadores bloquean los scripts con file://.
