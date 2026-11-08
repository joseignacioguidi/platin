# Landing (iteración 12) — design reference

Mockups de la landing actualizada (fase 38), exportados del canvas de diseño. Son una REFERENCIA, no código de producción: el markup es estático y con estilos en línea. Hay que replicar los valores (textos, colores, tamaños, bordes, orden de las secciones) en `apps/web/src/app/landing/` con los tokens de Tailwind, sin copiar el markup.

## Contenido

- `Escritorio.dc.html` — la landing a 1440 px.
- `Celular.dc.html` — la landing a 390 px.
- `support.js`, `vendor/react*.js` — el runtime que dibuja los mockups; no es parte del diseño.

## Qué cambia respecto de la landing actual

- Subtítulo del hero con todas las monedas; la pastilla "3 para confirmar" pasa a "Spotify · Confirmar".
- "¿Cuánto me queda libre este mes?": "Para pagar" en `pending` (como en la app) y el por día.
- "¿Me alcanza para pagar todo?" reemplaza a "¿Cuánto tengo separado para cada cosa?".
- Sección nueva antes del cierre: "Cargá un gasto mandando un mensaje", con una conversación de ejemplo y los canales (Telegram disponible, WhatsApp próximamente).
- El cierre suma "y tu primer gasto desde el chat".

## Notas

- Los montos y mensajes son ejemplos, coherentes con los de la landing.
- La tipografía de los mockups es Hanken Grotesk porque Uncut Sans no estaba en el editor; la landing usa Uncut Sans y JetBrains Mono como siempre.
- La burbuja de los canales es un ícono genérico de chat: no se usan los logos de Telegram ni de WhatsApp.
- El movimiento de los mensajes no se ve en el mockup (es estático); está descrito en LAN-03.

## Ver

Serví la carpeta (por ejemplo `python3 -m http.server`) y abrí cada `.dc.html`.
