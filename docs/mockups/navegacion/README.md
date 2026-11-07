# Navegación reagrupada (iteración 10) — design reference

Mockups de la barra lateral de 6 secciones y de las pantallas que se agrupan con pestañas (fase 36), exportados del canvas de diseño. Son una REFERENCIA, no código de producción: los valores de diseño (colores, tamaños, espaciados, radios, orden de las secciones) están en los `style="…"` y hay que replicarlos con los tokens de Tailwind y los componentes de `libs/web-ui`, no copiar el markup.

## Contenido

- `Compromisos.dc.html` — Compromisos › Próximos meses en escritorio (1440 px): la barra lateral nueva, las pestañas, el aviso de pendientes, la lista de meses a la izquierda y el detalle del mes elegido a la derecha.
- `Fijos.dc.html` — Compromisos › Fijos: gastos fijos e ingresos fijos en dos columnas.
- `Para-confirmar.dc.html` — Compromisos › Para confirmar: una fila por pendiente, con casilla, monto real y "Confirmar".
- `Ahorros.dc.html` — Ahorros e inversiones › Metas y ahorros: total ahorrado, resumen de inversiones, metas y reservas de ahorro.
- `Inversiones.dc.html` — Ahorros e inversiones › Inversiones: valor actual, valores cargados a mano y posiciones por cuenta.
- `Mas.dc.html` — la pantalla "Más" en celular (390 px), con 3 secciones, el acceso al perfil y los interruptores de ocultar montos y modo oscuro.
- `support.js`, `vendor/react*.js` — el runtime que dibuja los mockups en el navegador; no es parte del diseño.

## Datos

Los montos de noviembre en Compromisos, los de Ahorros y los de Inversiones salen de capturas reales de la app. Los meses siguientes, las reservas y las posiciones que no se veían en las capturas figuran como `[MONTO]`, `[RESERVA]`, `[CUENTA]` y `[TIPO]`. El contador "2" de Para confirmar es de ejemplo.

Los colores están en hex porque el editor no tiene los tokens: en la app, el rojo de "Desvincular" y de la zona peligrosa es `expense-ink`, el amarillo del contador es `pending`, y así con el resto.

La tipografía de los mockups es Hanken Grotesk porque Uncut Sans no estaba disponible en el editor; la app usa Uncut Sans y JetBrains Mono como siempre.

## Ver

Serví la carpeta (por ejemplo `python3 -m http.server`) y abrí cada `.dc.html`; algunos navegadores bloquean los scripts con file://.
